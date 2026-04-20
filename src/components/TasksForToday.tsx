import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { getPreviousWorkday, formatDateKey } from "@/lib/weekUtils";
import { Loader2, ListTodo, CircleCheckBig, Check, Plus, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { isSameDay } from "date-fns";

interface TaskItem {
  text: string;
  completed: boolean;
}

interface SubSection {
  title: string;
  items: TaskItem[];
}

interface TaskSection {
  title: string;
  // Either flat items OR grouped subsections (Pending for Today uses subsections)
  items?: TaskItem[];
  subsections?: SubSection[];
}

const SECTION_SEPARATOR = " › ";
const PENDING_TITLE = "Pending for Today";
const TOP_ORDER = ["Completed Yesterday", PENDING_TITLE, "Carryover, Blockers & Follow-ups"];

interface TasksForTodayProps {
  selectedDate?: Date;
}

const TasksForToday = ({ selectedDate }: TasksForTodayProps = {}) => {
  const { user } = useAuth();
  const [sections, setSections] = useState<TaskSection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [newTasksText, setNewTasksText] = useState("");
  const [adding, setAdding] = useState(false);
  const todayKey = formatDateKey(new Date());
  const isViewingToday = !selectedDate || isSameDay(selectedDate, new Date());
  const [expanded, setExpanded] = useState(true);

  // Auto-collapse when navigating to a past/future day; auto-expand on today
  useEffect(() => {
    setExpanded(isViewingToday);
  }, [isViewingToday]);

  // Load existing tasks from DB on mount
  useEffect(() => {
    if (!user) return;
    const loadExisting = async () => {
      const { data } = await supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", todayKey);

      if (!data || data.length === 0) return;

      // Group rows by top-level section, preserving subsection structure if present
      const topMap = new Map<string, Map<string | null, TaskItem[]>>();
      data.forEach((row) => {
        const [top, sub = null] = row.section.split(SECTION_SEPARATOR);
        if (!topMap.has(top)) topMap.set(top, new Map());
        const subMap = topMap.get(top)!;
        const key = sub;
        if (!subMap.has(key)) subMap.set(key, []);
        subMap.get(key)!.push({ text: row.task_text, completed: row.completed });
      });

      const restored: TaskSection[] = [];
      const visit = (top: string) => {
        if (!topMap.has(top)) return;
        const subMap = topMap.get(top)!;
        const hasSubs = Array.from(subMap.keys()).some((k) => k !== null);
        if (hasSubs) {
          const subsections: SubSection[] = [];
          subMap.forEach((items, subTitle) => {
            subsections.push({ title: subTitle ?? "General", items });
          });
          restored.push({ title: top, subsections });
        } else {
          restored.push({ title: top, items: subMap.get(null) ?? [] });
        }
        topMap.delete(top);
      };
      TOP_ORDER.forEach(visit);
      topMap.forEach((_subMap, top) => visit(top));
      setSections(restored);
    };
    loadExisting();
  }, [user, todayKey]);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const prevDay = getPreviousWorkday(new Date());
    const prevKey = formatDateKey(prevDay);

    const [entryRes, prevTasksRes, incompletePastRes, everCompletedRes, todayTasksRes] = await Promise.all([
      supabase
        .from("daily_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("entry_date", prevKey)
        .maybeSingle(),
      supabase
        .from("daily_tasks")
        .select("task_text, completed, section, task_date")
        .eq("user_id", user.id)
        .eq("task_date", prevKey),
      // All unchecked tasks from any prior day (carryover candidates)
      supabase
        .from("daily_tasks")
        .select("task_text, section, task_date")
        .eq("user_id", user.id)
        .eq("completed", false)
        .lt("task_date", todayKey),
      // Every task EVER completed (any past day) — used as a global exclusion
      // list so re-completed work cannot leak back into today's pending.
      supabase
        .from("daily_tasks")
        .select("task_text")
        .eq("user_id", user.id)
        .eq("completed", true)
        .lte("task_date", todayKey),
      // Today's existing rows — preserves checked state when regenerating.
      supabase
        .from("daily_tasks")
        .select("task_text, completed")
        .eq("user_id", user.id)
        .eq("task_date", todayKey),
    ]);

    // Backfill safety net: if yesterday has an entry but ZERO daily_tasks rows,
    // retroactively parse the EOD pending_tasks into daily_tasks rows so they
    // can be carried over and reconciled.
    let prevTasks = prevTasksRes.data || [];
    let carryoverData = incompletePastRes.data || [];
    if (entryRes.data && prevTasks.length === 0 && (entryRes.data.pending_tasks || "").trim()) {
      try {
        const { data: parsed } = await supabase.functions.invoke("ai-parse-tasks", {
          body: { text: entryRes.data.pending_tasks },
        });
        const items: string[] = Array.isArray(parsed?.items) ? parsed.items : [];
        if (items.length > 0) {
          const seedSection = "Pending for Today › From EOD Entry";
          const seedRows = items.map((t) => ({
            user_id: user.id,
            task_date: prevKey,
            section: seedSection,
            task_text: t,
            completed: false,
          }));
          await supabase.from("daily_tasks").insert(seedRows);
          prevTasks = seedRows.map((r) => ({
            task_text: r.task_text,
            completed: r.completed,
            section: r.section,
            task_date: r.task_date,
          }));
          // Merge into carryover candidates too
          carryoverData = [
            ...carryoverData,
            ...seedRows.map((r) => ({ task_text: r.task_text, section: r.section, task_date: r.task_date })),
          ];
        }
      } catch (e) {
        console.error("Backfill seed failed:", e);
      }
    }

    if (!entryRes.data && carryoverData.length === 0) {
      setSections([{ title: "Info", items: [{ text: "No entry found for the previous workday and no pending tasks. Start fresh today!", completed: false }] }]);
      setLoading(false);
      return;
    }

    // Normalize text for fuzzy matching (case/whitespace/punctuation-insensitive)
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    // Build exclusion list: every task ever completed (any day, including today's
    // already-checked items). This prevents re-completed work from leaking back
    // into today's pending list, even when the EOD prose still mentions it.
    const completedExclusionSet = new Set<string>();
    const completedExclusionDisplay: string[] = [];
    [
      ...(everCompletedRes.data || []),
      ...(todayTasksRes.data || []).filter((t) => t.completed),
    ].forEach((t) => {
      const k = norm(t.task_text);
      if (k && !completedExclusionSet.has(k)) {
        completedExclusionSet.add(k);
        completedExclusionDisplay.push(t.task_text);
      }
    });

    // Map of normalized text -> completed state, used to preserve checks across regenerate.
    const completedByText = new Map<string, boolean>();
    (todayTasksRes.data || []).forEach((t) => {
      completedByText.set(norm(t.task_text), t.completed);
    });
    completedExclusionSet.forEach((k) => completedByText.set(k, true));

    // Dedupe carryover by task_text, keep oldest date, and exclude already-completed items
    const carryoverMap = new Map<string, { task_text: string; task_date: string; section: string }>();
    carryoverData.forEach((r) => {
      if (completedExclusionSet.has(norm(r.task_text))) return;
      const existing = carryoverMap.get(r.task_text);
      if (!existing || r.task_date < existing.task_date) {
        carryoverMap.set(r.task_text, r);
      }
    });
    const carryover = Array.from(carryoverMap.values());

    try {
      const { data, error } = await supabase.functions.invoke("ai-daily-tasks", {
        body: {
          entry: entryRes.data || { accomplishments: "", pending_tasks: "", blockers: "", notes: "" },
          completed_tasks: prevTasks,
          incomplete_carryover: carryover,
          completed_exclusion: completedExclusionDisplay,
        },
      });
      if (error) throw error;

      if (data.sections) {
        const parsed: TaskSection[] = data.sections.map((s: { title: string; items?: string[]; subsections?: { title: string; items: string[] }[] }) => {
          const restoreCompleted = (text: string) =>
            s.title === "Completed Yesterday" ? true : (completedByText.get(norm(text)) ?? false);
          if (s.subsections && Array.isArray(s.subsections)) {
            return {
              title: s.title,
              subsections: s.subsections.map((sub) => ({
                title: sub.title,
                // Drop any item that matches the global completed-exclusion set
                items: (sub.items || [])
                  .filter((text) => !completedExclusionSet.has(norm(text)))
                  .map((text) => ({ text, completed: restoreCompleted(text) })),
              })).filter((sub) => sub.items.length > 0),
            };
          }
          return {
            title: s.title,
            items: (s.items || [])
              // Keep completed items inside "Completed Yesterday"; filter elsewhere
              .filter((text) =>
                s.title === "Completed Yesterday" ? true : !completedExclusionSet.has(norm(text))
              )
              .map((text) => ({ text, completed: restoreCompleted(text) })),
          };
        });
        setSections(parsed);
        await persistTasks(parsed);
      } else if (data.summary) {
        setSections([{ title: "Tasks", items: [{ text: data.summary, completed: false }] }]);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate task summary");
    } finally {
      setLoading(false);
    }
  };

  const sectionKeyFor = (top: string, sub?: string | null) =>
    sub ? `${top}${SECTION_SEPARATOR}${sub}` : top;

  const persistTasks = async (taskSections: TaskSection[]) => {
    if (!user) return;
    await supabase.from("daily_tasks").delete().eq("user_id", user.id).eq("task_date", todayKey);

    const rows: Array<{ user_id: string; task_date: string; section: string; task_text: string; completed: boolean }> = [];
    taskSections.forEach((section) => {
      if (section.subsections) {
        section.subsections.forEach((sub) => {
          sub.items.forEach((item) => {
            rows.push({
              user_id: user.id,
              task_date: todayKey,
              section: sectionKeyFor(section.title, sub.title),
              task_text: item.text,
              completed: item.completed,
            });
          });
        });
      } else if (section.items) {
        section.items.forEach((item) => {
          rows.push({
            user_id: user.id,
            task_date: todayKey,
            section: section.title,
            task_text: item.text,
            completed: item.completed,
          });
        });
      }
    });
    if (rows.length > 0) {
      await supabase.from("daily_tasks").insert(rows);
    }
  };

  const toggleTaskAt = async (
    sectionIdx: number,
    subIdx: number | null,
    itemIdx: number,
  ) => {
    if (!sections || !user) return;

    const updated = sections.map((section, si) => {
      if (si !== sectionIdx) return section;
      if (subIdx !== null && section.subsections) {
        return {
          ...section,
          subsections: section.subsections.map((sub, sj) => {
            if (sj !== subIdx) return sub;
            return {
              ...sub,
              items: sub.items.map((item, ii) =>
                ii === itemIdx ? { ...item, completed: !item.completed } : item
              ),
            };
          }),
        };
      }
      if (subIdx === null && section.items) {
        return {
          ...section,
          items: section.items.map((item, ii) =>
            ii === itemIdx ? { ...item, completed: !item.completed } : item
          ),
        };
      }
      return section;
    });
    setSections(updated);

    const targetSection = updated[sectionIdx];
    let task: TaskItem;
    let dbSection: string;
    if (subIdx !== null && targetSection.subsections) {
      task = targetSection.subsections[subIdx].items[itemIdx];
      dbSection = sectionKeyFor(targetSection.title, targetSection.subsections[subIdx].title);
    } else if (targetSection.items) {
      task = targetSection.items[itemIdx];
      dbSection = targetSection.title;
    } else {
      return;
    }

    const key = `${sectionIdx}-${subIdx ?? "x"}-${itemIdx}`;
    setSavingKey(key);

    const { data: existing } = await supabase
      .from("daily_tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_date", todayKey)
      .eq("task_text", task.text)
      .eq("section", dbSection)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("daily_tasks")
        .update({ completed: task.completed })
        .eq("id", existing.id);
      setSavingKey(null);
      if (error) {
        toast.error("Couldn't save task status");
        return;
      }
      toast.success(
        task.completed ? "Task marked complete — saved as context" : "Task marked incomplete — saved"
      );
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
    } else {
      setSavingKey(null);
      toast.error("Couldn't find task to update");
    }
  };

  const addMoreTasks = async () => {
    if (!user) return;
    const text = newTasksText.trim();
    if (!text) {
      toast.error("Please enter some tasks first");
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-tasks", {
        body: { text },
      });
      if (error) throw error;
      const items: string[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        toast.error("Couldn't extract any tasks from that text");
        return;
      }

      const current = sections ?? [];
      const newItems: TaskItem[] = items.map((t) => ({ text: t, completed: false }));
      const ADDED_SUB_TITLE = "Added Manually";

      let updated: TaskSection[];
      const pendingIdx = current.findIndex((s) => s.title === PENDING_TITLE);

      if (pendingIdx === -1) {
        updated = [
          ...current,
          { title: PENDING_TITLE, subsections: [{ title: ADDED_SUB_TITLE, items: newItems }] },
        ];
      } else {
        const pending = current[pendingIdx];
        let newPending: TaskSection;
        if (pending.subsections) {
          const existingSubIdx = pending.subsections.findIndex((s) => s.title === ADDED_SUB_TITLE);
          const newSubs = existingSubIdx >= 0
            ? pending.subsections.map((s, i) =>
                i === existingSubIdx ? { ...s, items: [...s.items, ...newItems] } : s
              )
            : [...pending.subsections, { title: ADDED_SUB_TITLE, items: newItems }];
          newPending = { ...pending, subsections: newSubs };
        } else {
          // Convert flat to subsections
          const existingItems = pending.items ?? [];
          newPending = {
            title: PENDING_TITLE,
            subsections: [
              ...(existingItems.length ? [{ title: "General", items: existingItems }] : []),
              { title: ADDED_SUB_TITLE, items: newItems },
            ],
          };
        }
        updated = current.map((s, i) => (i === pendingIdx ? newPending : s));
      }

      setSections(updated);

      const rows = newItems.map((item) => ({
        user_id: user.id,
        task_date: todayKey,
        section: sectionKeyFor(PENDING_TITLE, ADDED_SUB_TITLE),
        task_text: item.text,
        completed: item.completed,
      }));
      const { error: insertError } = await supabase.from("daily_tasks").insert(rows);
      if (insertError) throw insertError;

      setNewTasksText("");
      toast.success(`Added ${items.length} task${items.length === 1 ? "" : "s"}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to add tasks");
    } finally {
      setAdding(false);
    }
  };

  // Render a single task row (checkbox or completed-yesterday icon)
  const renderTaskRow = (
    item: TaskItem,
    sectionTitle: string,
    sectionIdx: number,
    subIdx: number | null,
    itemIdx: number,
  ) => {
    if (sectionTitle === "Completed Yesterday") {
      return (
        <div key={itemIdx} className="flex items-start gap-2">
          <CircleCheckBig className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-sm leading-snug text-muted-foreground">{item.text}</span>
        </div>
      );
    }
    const key = `${sectionIdx}-${subIdx ?? "x"}-${itemIdx}`;
    const isSaving = savingKey === key;
    const isSaved = savedKey === key;
    return (
      <label key={itemIdx} className="flex items-start gap-2 cursor-pointer group">
        <Checkbox
          checked={item.completed}
          onCheckedChange={() => toggleTaskAt(sectionIdx, subIdx, itemIdx)}
          className="mt-0.5"
          disabled={isSaving}
        />
        <span
          className={`text-sm leading-snug transition-all flex-1 ${
            item.completed ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {item.text}
        </span>
        {isSaving && (
          <Loader2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground animate-spin shrink-0" />
        )}
        {isSaved && !isSaving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 shrink-0 animate-fade-in">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </label>
    );
  };

  return (
    <Card>
      <CardHeader
        className={!isViewingToday ? "cursor-pointer select-none" : undefined}
        onClick={!isViewingToday ? () => setExpanded((v) => !v) : undefined}
      >
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" /> Tasks for Today
          {!isViewingToday && (
            <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
              {expanded ? (
                <>Hide <ChevronUp className="h-3.5 w-3.5" /></>
              ) : (
                <>Show <ChevronDown className="h-3.5 w-3.5" /></>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
      <CardContent>
        {!sections && !loading && (
          <Button onClick={fetchTasks} variant="outline" className="w-full">
            What are my tasks for today?
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {sections && (
          <div className="space-y-5">
            {sections.map((section, si) => (
              <div key={si}>
                <p className="font-semibold text-sm text-foreground mb-2">{section.title}</p>
                {section.subsections ? (
                  <div className="space-y-3">
                    {section.subsections.map((sub, sj) => (
                      <div key={sj} className="pl-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                          {sub.title}
                        </p>
                        <div className="space-y-1.5">
                          {sub.items.map((item, ii) =>
                            renderTaskRow(item, section.title, si, sj, ii)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(section.items ?? []).map((item, ii) =>
                      renderTaskRow(item, section.title, si, null, ii)
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {sections && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add More Tasks
            </label>
            <Textarea
              value={newTasksText}
              onChange={(e) => setNewTasksText(e.target.value)}
              placeholder="Type any extra tasks (free-form). AI will turn them into concise items."
              className="min-h-[60px]"
              disabled={adding}
            />
            <div className="flex items-center gap-2">
              <Button onClick={addMoreTasks} size="sm" disabled={adding || !newTasksText.trim()}>
                {adding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Parsing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Add tasks
                  </>
                )}
              </Button>
              <Button onClick={fetchTasks} variant="ghost" size="sm" disabled={adding}>
                Refresh
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
};

export default TasksForToday;
