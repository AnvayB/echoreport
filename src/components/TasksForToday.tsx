import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { getPreviousWorkday, formatDateKey } from "@/lib/weekUtils";
import { dedupeTaskRows, dedupeTaskTexts, mergeDuplicateTaskRows } from "@/lib/taskUtils";
import {
  Loader2, ListTodo, CircleCheckBig, Check, Plus, Sparkles,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { isSameDay } from "date-fns";

interface TaskRow {
  id: string;
  task_text: string;
  completed: boolean;
  section: string;
  task_date: string;
}

interface TasksForTodayProps {
  selectedDate?: Date;
}

interface TaskGroup {
  title: string;
  rows: TaskRow[];
}

const TasksForToday = ({ selectedDate }: TasksForTodayProps = {}) => {
  const { user } = useAuth();
  const [completedYesterday, setCompletedYesterday] = useState<TaskRow[]>([]);
  const [pending, setPending] = useState<TaskRow[]>([]);
  const [blockers, setBlockers] = useState<TaskRow[]>([]);
  const [pendingGroups, setPendingGroups] = useState<TaskGroup[] | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newTasksText, setNewTasksText] = useState("");
  const [adding, setAdding] = useState(false);

  const today = selectedDate ?? new Date();
  const todayKey = formatDateKey(today);
  const isViewingToday = !selectedDate || isSameDay(selectedDate, new Date());
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setExpanded(isViewingToday);
  }, [isViewingToday]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const prevKey = formatDateKey(getPreviousWorkday(today));

    const [completedRes, pendingRes, blockerRes] = await Promise.all([
      supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", prevKey)
        .eq("completed", true),
      supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("completed", false)
        .in("section", ["pending", "pending:manual"])
        .lte("task_date", todayKey)
        .order("task_date", { ascending: true }),
      supabase
        .from("daily_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("completed", false)
        .eq("section", "blocker")
        .lte("task_date", todayKey)
        .order("task_date", { ascending: true }),
    ]);

    const completedResult = mergeDuplicateTaskRows(completedRes.data ?? []);
    const pendingResult = mergeDuplicateTaskRows(pendingRes.data ?? []);
    const blockerResult = mergeDuplicateTaskRows(blockerRes.data ?? []);
    const duplicateIds = [
      ...completedResult.duplicateIds,
      ...pendingResult.duplicateIds,
      ...blockerResult.duplicateIds,
    ];

    if (duplicateIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from("daily_tasks")
        .delete()
        .in("id", duplicateIds);

      if (cleanupError) {
        console.error("Failed to clean duplicate tasks:", cleanupError);
      }
    }

    setCompletedYesterday(completedResult.rows);
    setPending(pendingResult.rows);
    setBlockers(blockerResult.rows);
    setLoaded(true);
    setLoading(false);
  };

  // Auto-load on mount / when date or user changes
  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, todayKey]);

  // Group pending tasks by project/theme via AI. Re-runs only when the set of pending ids changes.
  const pendingIdsKey = pending.map((r) => r.id).sort().join("|");
  useEffect(() => {
    if (pending.length === 0) {
      setPendingGroups(null);
      return;
    }
    if (pending.length <= 2) {
      setPendingGroups([{ title: "General", rows: pending }]);
      return;
    }
    let cancelled = false;
    setGrouping(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ai-group-tasks", {
          body: {
            tasks: pending.map((r) => ({ id: r.id, task_text: r.task_text })),
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const rawGroups: Array<{ title: string; task_ids: string[] }> =
          Array.isArray(data?.groups) ? data.groups : [];
        const byId = new Map(pending.map((r) => [r.id, r]));
        const used = new Set<string>();
        const groups: TaskGroup[] = [];
        rawGroups.forEach((g) => {
          const rows = (g.task_ids || [])
            .map((id) => byId.get(id))
            .filter((r): r is TaskRow => Boolean(r) && !used.has(r!.id));
          rows.forEach((r) => used.add(r.id));
          if (rows.length > 0) groups.push({ title: g.title, rows });
        });
        const leftover = pending.filter((r) => !used.has(r.id));
        if (leftover.length > 0) groups.push({ title: "Other", rows: leftover });
        setPendingGroups(groups.length > 0 ? groups : [{ title: "General", rows: pending }]);
      } catch (e) {
        console.error("Failed to group tasks:", e);
        if (!cancelled) setPendingGroups([{ title: "General", rows: pending }]);
      } finally {
        if (!cancelled) setGrouping(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdsKey]);

  const toggleTask = async (row: TaskRow) => {
    if (!user) return;
    const newCompleted = !row.completed;
    setSavingId(row.id);

    // Optimistic update
    const update = (list: TaskRow[]) =>
      list.map((r) => (r.id === row.id ? { ...r, completed: newCompleted } : r));
    setPending(update);
    setBlockers(update);

    const { error } = await supabase
      .from("daily_tasks")
      .update({ completed: newCompleted })
      .eq("id", row.id);
    setSavingId(null);

    if (error) {
      toast.error("Couldn't save task status");
      // Revert
      setPending((list) => list.map((r) => (r.id === row.id ? { ...r, completed: row.completed } : r)));
      setBlockers((list) => list.map((r) => (r.id === row.id ? { ...r, completed: row.completed } : r)));
      return;
    }

    setSavedId(row.id);
    setTimeout(() => setSavedId((id) => (id === row.id ? null : id)), 1200);

    if (newCompleted) {
      // Remove from current list (it'll show under Completed on its source date)
      setPending((list) => list.filter((r) => r.id !== row.id));
      setBlockers((list) => list.filter((r) => r.id !== row.id));
      toast.success("Task complete");
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
      const items = dedupeTaskTexts(Array.isArray(data?.items) ? data.items : []);
      if (items.length === 0) {
        toast.error("Couldn't extract any tasks from that text");
        return;
      }

      const rows = items.map((t) => ({
        user_id: user.id,
        task_date: todayKey,
        section: "pending:manual",
        task_text: t,
        completed: false,
      }));
      const { data: inserted, error: insertError } = await supabase
        .from("daily_tasks")
        .insert(rows)
        .select("*");
      if (insertError) throw insertError;

      setPending((list) => [...list, ...(inserted ?? [])]);
      setNewTasksText("");
      toast.success(`Added ${items.length} task${items.length === 1 ? "" : "s"}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to add tasks");
    } finally {
      setAdding(false);
    }
  };

  const renderCheckboxRow = (row: TaskRow) => {
    const isSaving = savingId === row.id;
    const isSaved = savedId === row.id;
    return (
      <label key={row.id} className="flex items-start gap-2 cursor-pointer group">
        <Checkbox
          checked={row.completed}
          onCheckedChange={() => toggleTask(row)}
          className="mt-0.5"
          disabled={isSaving}
        />
        <span
          className={`text-sm leading-snug transition-all flex-1 ${
            row.completed ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {row.task_text}
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

  const isEmpty = loaded && completedYesterday.length === 0 && pending.length === 0 && blockers.length === 0;

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
          {loading && !loaded && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {loaded && isEmpty && (
            <p className="text-sm text-muted-foreground py-2">
              No tasks yet. Save an end-of-day entry to populate tomorrow's list, or add tasks below.
            </p>
          )}
          {loaded && !isEmpty && (
            <div className="space-y-5">
              {completedYesterday.length > 0 && (
                <div>
                  <p className="font-semibold text-sm text-foreground mb-2">Completed Yesterday</p>
                  <div className="space-y-1.5">
                    {completedYesterday.map((row) => (
                      <div key={row.id} className="flex items-start gap-2">
                        <CircleCheckBig className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <span className="text-sm leading-snug text-muted-foreground">
                          {row.task_text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pending.length > 0 && (
                <div>
                  <p className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
                    Pending for Today
                    {grouping && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </p>
                  {pendingGroups ? (
                    <div className="space-y-3">
                      {pendingGroups.map((g, gi) => (
                        <div key={gi} className="pl-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                            {g.title}
                          </p>
                          <div className="space-y-1.5">
                            {g.rows.map(renderCheckboxRow)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">{pending.map(renderCheckboxRow)}</div>
                  )}
                </div>
              )}
              {blockers.length > 0 && (
                <div>
                  <p className="font-semibold text-sm text-foreground mb-2">Blockers & Follow-ups</p>
                  <div className="space-y-1.5">
                    {blockers.map(renderCheckboxRow)}
                  </div>
                </div>
              )}
            </div>
          )}
          {loaded && (
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
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Parsing…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Add tasks</>
                  )}
                </Button>
                <Button onClick={load} variant="ghost" size="sm" disabled={adding || loading}>
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
