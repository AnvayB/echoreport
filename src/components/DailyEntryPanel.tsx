import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VoiceInput from "./VoiceInput";
import { formatDateKey, formatDayLabel } from "@/lib/weekUtils";
import { areTaskTextsEquivalent, mergeDuplicateTaskRows, normalizeTaskText } from "@/lib/taskUtils";
import { resolveWhenHint } from "@/lib/scheduleHints";
import { toast } from "sonner";
import { Save, Loader2, Sparkles, Pencil } from "lucide-react";

type ScheduleHint = { text: string; when: string | null };

interface DailyEntryPanelProps {
  date: Date;
  onSaved: () => void;
}

const DailyEntryPanel = ({ date, onSaved }: DailyEntryPanelProps) => {
  const { user } = useAuth();
  const [freeText, setFreeText] = useState("");
  const [accomplishments, setAccomplishments] = useState("");
  const [pendingTasks, setPendingTasks] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [isFirstSave, setIsFirstSave] = useState(true);
  const [pendingTaskSchedule, setPendingTaskSchedule] = useState<ScheduleHint[]>([]);

  const dateKey = formatDateKey(date);

  // Reset and load when date changes
  useEffect(() => {
    if (!user) return;
    setFreeText("");
    setAccomplishments("");
    setPendingTasks("");
    setBlockers("");
    setNotes("");
    setPendingTaskSchedule([]);
    setParsed(false);
    setIsFirstSave(true);
    supabase
      .from("daily_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("entry_date", dateKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAccomplishments(data.accomplishments);
          setPendingTasks(data.pending_tasks);
          setBlockers(data.blockers);
          setNotes(data.notes);
          if (data.accomplishments || data.pending_tasks || data.blockers || data.notes) {
            setParsed(true);
            setIsFirstSave(false);
          }
        }
      });
  }, [user, dateKey]);

  const handleParse = async () => {
    if (!freeText.trim()) {
      toast.error("Please enter your update first");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-entry", {
        body: { text: freeText, today_date: dateKey },
      });
      if (error) throw error;
      setAccomplishments(data.accomplishments || "");
      setPendingTasks(data.pending_tasks || "");
      setBlockers(data.blockers || "");
      setNotes(data.notes || "");
      const schedule: ScheduleHint[] = Array.isArray(data?.pending_task_schedule)
        ? data.pending_task_schedule
            .filter((s: any) => s && typeof s.text === "string")
            .map((s: any) => ({ text: s.text, when: typeof s.when === "string" ? s.when : null }))
        : [];
      setPendingTaskSchedule(schedule);
      setParsed(true);
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse entry. You can edit the fields manually.");
      setAccomplishments(freeText);
      setPendingTaskSchedule([]);
      setParsed(true);
    } finally {
      setParsing(false);
    }
  };

  // Parse a free-form text block into structured task items via the AI helper.
  const parseToItems = async (text: string): Promise<ScheduleHint[]> => {
    if (!text.trim()) return [];
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-tasks", {
        body: { text, today_date: dateKey },
      });
      if (error) throw error;
      const items = Array.isArray(data?.items) ? data.items : [];
      return items
        .filter((i: any) => i && typeof i.text === "string")
        .map((i: any) => ({ text: i.text, when: typeof i.when === "string" ? i.when : null }));
    } catch (e) {
      console.error("Failed to parse tasks:", e);
      return [];
    }
  };

  // Idempotent re-sync: replace EOD-sourced rows for this date, but preserve manually-added rows.
  const syncTasksFromEntry = async () => {
    if (!user) return;
    const [completedItems, pendingItems, blockerItems] = await Promise.all([
      parseToItems(accomplishments),
      parseToItems(pendingTasks),
      parseToItems(blockers),
    ]);

    // Dedupe each list while preserving the first when-hint we see for each unique item.
    const dedupeHints = (items: ScheduleHint[]): ScheduleHint[] => {
      const out: ScheduleHint[] = [];
      items.forEach((it) => {
        if (!it?.text || !it.text.trim()) return;
        if (out.some((e) => areTaskTextsEquivalent(e.text, it.text))) return;
        out.push({ text: it.text, when: it.when ?? null });
      });
      return out;
    };

    const uniqueCompletedHints = dedupeHints(completedItems);
    const uniquePendingHints = dedupeHints([
      // Prefer schedule from the rich entry parse (which sees full free-text context),
      // and fall back to per-line schedule from parseToItems(pendingTasks).
      ...pendingTaskSchedule,
      ...pendingItems,
    ]);
    const uniqueBlockerHints = dedupeHints(blockerItems);

    const uniqueCompletedItems = uniqueCompletedHints.map((h) => h.text);
    const uniquePendingItems = uniquePendingHints.map((h) => h.text);
    const uniqueBlockerItems = uniqueBlockerHints.map((h) => h.text);

    // Remove only EOD-sourced rows (sections: completed | pending | blocker).
    // Manually added rows live under "pending:manual" and are preserved.
    const { error: deleteError } = await supabase
      .from("daily_tasks")
      .delete()
      .eq("user_id", user.id)
      .eq("task_date", dateKey)
      .in("section", ["completed", "pending", "blocker"]);

    if (deleteError) throw deleteError;

    const { data: openRows, error: openRowsError } = await supabase
      .from("daily_tasks")
      .select("id, section, task_text")
      .eq("user_id", user.id)
      .eq("completed", false)
      .in("section", ["pending", "pending:manual", "blocker"]);

    if (openRowsError) throw openRowsError;

    const { data: manualCompletedRows, error: manualCompletedError } = await supabase
      .from("daily_tasks")
      .select("id, section, task_text")
      .eq("user_id", user.id)
      .eq("task_date", dateKey)
      .eq("section", "completed:manual");

    if (manualCompletedError) throw manualCompletedError;

    const { rows: uniqueOpenRows, duplicateIds } = mergeDuplicateTaskRows(openRows ?? []);
    if (duplicateIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from("daily_tasks")
        .delete()
        .in("id", duplicateIds);

      if (cleanupError) throw cleanupError;
    }

    const completedKeys = new Set(uniqueCompletedItems.map((item) => normalizeTaskText(item)));
    const updates: Array<{ id: string; task_date: string; section: string; completed: boolean }> = [];

    const rows: Array<{
      user_id: string; task_date: string; section: string;
      task_text: string; completed: boolean;
    }> = [];
    uniqueCompletedItems.forEach((taskText) => {
      // Skip: already checked off manually — don't create a duplicate completed row.
      const alreadyManuallyCompleted = (manualCompletedRows ?? []).some(
        (row) => areTaskTextsEquivalent(row.task_text, taskText)
      );
      if (alreadyManuallyCompleted) return;

      const normalized = normalizeTaskText(taskText);
      const matchingPending = uniqueOpenRows.find(
        (row) => ["pending", "pending:manual", "blocker"].includes(row.section) && areTaskTextsEquivalent(row.task_text, taskText)
      );

      if (matchingPending) {
        updates.push({ id: matchingPending.id, task_date: dateKey, section: "completed", completed: true });
        return;
      }

      rows.push({ user_id: user.id, task_date: dateKey, section: "completed", task_text: taskText, completed: true });
    });

    uniquePendingHints.forEach(({ text: taskText, when }) => {
      const normalized = normalizeTaskText(taskText);
      if (completedKeys.has(normalized)) return;
      if (uniqueOpenRows.some((row) => row.section.startsWith("pending") && areTaskTextsEquivalent(row.task_text, taskText))) return;
      const taskDate = resolveWhenHint(when, date, dateKey);
      rows.push({ user_id: user.id, task_date: taskDate, section: "pending", task_text: taskText, completed: false });
    });

    uniqueBlockerItems.forEach((taskText) => {
      const normalized = normalizeTaskText(taskText);
      if (completedKeys.has(normalized)) return;
      if (uniqueOpenRows.some((row) => row.section === "blocker" && areTaskTextsEquivalent(row.task_text, taskText))) return;
      rows.push({ user_id: user.id, task_date: dateKey, section: "blocker", task_text: taskText, completed: false });
    });

    if (updates.length > 0) {
      const updateResults = await Promise.all(
        updates.map((update) =>
          supabase
            .from("daily_tasks")
            .update({ task_date: update.task_date, section: update.section, completed: update.completed })
            .eq("id", update.id)
        )
      );
      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) throw updateError;
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("daily_tasks").insert(rows);
      if (insertError) throw insertError;
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("daily_entries").upsert(
      {
        user_id: user.id,
        entry_date: dateKey,
        accomplishments,
        pending_tasks: pendingTasks,
        blockers,
        notes,
      },
      { onConflict: "user_id,entry_date" }
    );
    setSaving(false);
    if (error) {
      toast.error("Failed to save entry");
      console.error(error);
    } else {
      toast.success(isFirstSave ? "Logged! See you tomorrow!" : "Logged!");
      setIsFirstSave(false);
      onSaved();
      syncTasksFromEntry().catch((taskSyncError) => {
        console.error(taskSyncError);
        toast.error("Saved entry, but task syncing failed");
      });
    }
  };

  const handleEditRaw = () => {
    const combined = [
      accomplishments && `Accomplished: ${accomplishments}`,
      pendingTasks && `Pending: ${pendingTasks}`,
      blockers && `Blockers: ${blockers}`,
      notes && `Notes: ${notes}`,
    ].filter(Boolean).join("\n\n");
    setFreeText(combined);
    setParsed(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pencil className="h-4 w-4" />
          {formatDayLabel(date)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  What did you get done? Any challenges? What's next?
                </p>
                <VoiceInput onTranscript={(t) => setFreeText((prev) => (prev ? prev + " " + t : t))} />
              </div>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Brain-dump everything here — the AI will organize it for you."
                rows={6}
              />
            </div>
            <Button onClick={handleParse} disabled={parsing || !freeText.trim()} className="w-full">
              {parsing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Organizing…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Organize & Review</>
              )}
            </Button>
          </>
        ) : (
          <>
            {[
              { label: "Accomplishments", value: accomplishments, setter: setAccomplishments },
              { label: "Pending / Tomorrow", value: pendingTasks, setter: setPendingTasks },
              { label: "Blockers", value: blockers, setter: setBlockers },
              { label: "Notes", value: notes, setter: setNotes },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <Textarea
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  rows={2}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button onClick={handleEditRaw} variant="outline" size="sm">
                Edit raw
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyEntryPanel;
