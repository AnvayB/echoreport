import { useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPreviousWorkday, formatDateKey, getWeekEndKey } from "@/lib/weekUtils";
import { mergeDuplicateTaskRows, areTaskTextsEquivalent } from "@/lib/taskUtils";
import { resolveWhenHint } from "@/lib/scheduleHints";
import { toast } from "sonner";
import { addDays, isSameDay } from "date-fns";
import {
  TasksForTodayContext,
  type TaskRow,
  type TaskGroup,
  type Bucket,
  type PendingByBucket,
  type DuplicateCluster,
} from "./TasksForTodayContext";

export { useTasksForToday } from "./TasksForTodayContext";
export type { TaskRow, TaskGroup } from "./TasksForTodayContext";

interface ProviderProps {
  selectedDate?: Date;
  children: ReactNode;
}

export const TasksForTodayProvider = ({ selectedDate, children }: ProviderProps) => {
  const { user } = useAuth();
  const today = selectedDate ?? new Date();
  const todayKey = formatDateKey(today);
  const dow = today.getDay(); // 0=Sun … 6=Sat
  // On Fri/Sat/Sun, "Tomorrow" rolls to next Monday and "This Week" rolls to next workweek's Friday.
  const isEndOfWeek = dow === 5 || dow === 6 || dow === 0;
  const tomorrowOffset = dow === 5 ? 3 : dow === 6 ? 2 : dow === 0 ? 1 : 1;
  const tomorrowKey = formatDateKey(addDays(today, tomorrowOffset));
  const weekEndKey = isEndOfWeek
    ? getWeekEndKey(addDays(today, 7))
    : getWeekEndKey(today);
  const bucketLabels: Record<Bucket, string> = {
    today: "Today",
    tomorrow: isEndOfWeek ? "Monday" : "Tomorrow",
    thisWeek: isEndOfWeek ? "Next Week" : "This Week",
  };
  const isViewingToday = !selectedDate || isSameDay(selectedDate, new Date());

  const [completedYesterday, setCompletedYesterday] = useState<TaskRow[]>([]);
  const [completedToday, setCompletedToday] = useState<TaskRow[]>([]);
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

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const prevKey = formatDateKey(getPreviousWorkday(today));

    const [completedRes, pendingRes, blockerRes, completedTodayRes] = await Promise.all([
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("task_date", prevKey).eq("completed", true),
      // Pending: anything not completed up through end of this week (overdue + today + tomorrow + this week)
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("completed", false).in("section", ["pending", "pending:manual"]).lte("task_date", weekEndKey).order("task_date", { ascending: true }),
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("completed", false).eq("section", "blocker").lte("task_date", weekEndKey).order("task_date", { ascending: true }),
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("task_date", todayKey).eq("completed", true),
    ]);

    const completedResult = mergeDuplicateTaskRows(completedRes.data ?? []);
    const pendingResult = mergeDuplicateTaskRows(pendingRes.data ?? []);
    const blockerResult = mergeDuplicateTaskRows(blockerRes.data ?? []);
    const completedTodayResult = mergeDuplicateTaskRows(completedTodayRes.data ?? []);
    const duplicateIds = [
      ...completedResult.duplicateIds,
      ...pendingResult.duplicateIds,
      ...blockerResult.duplicateIds,
      ...completedTodayResult.duplicateIds,
    ];

    if (duplicateIds.length > 0) {
      const { error: cleanupError } = await supabase.from("daily_tasks").delete().in("id", duplicateIds);
      if (cleanupError) console.error("Failed to clean duplicate tasks:", cleanupError);
    }

    setCompletedYesterday(completedResult.rows);
    setCompletedToday(completedTodayResult.rows);
    setPending(pendingResult.rows);
    setBlockers(blockerResult.rows);
    setLoaded(true);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, todayKey]);

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
    // Optimistic in-place filter when only removals happened.
    const currentIds = new Set(pending.map((r) => r.id));
    setPendingGroups((prev) => {
      if (!prev) return prev;
      const groupedIds = new Set(prev.flatMap((g) => g.rows.map((r) => r.id)));
      const allCovered = [...currentIds].every((id) => groupedIds.has(id));
      if (!allCovered) return prev;
      const filtered = prev
        .map((g) => ({ ...g, rows: g.rows.filter((r) => currentIds.has(r.id)) }))
        .filter((g) => g.rows.length > 0);
      return filtered;
    });

    const existingGroupedIds = new Set(
      (pendingGroups ?? []).flatMap((g) => g.rows.map((r) => r.id))
    );
    const hasNewIds = pending.some((r) => !existingGroupedIds.has(r.id));
    if (!hasNewIds) return;

    let cancelled = false;
    setGrouping(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ai-group-tasks", {
          body: { tasks: pending.map((r) => ({ id: r.id, task_text: r.task_text })) },
        });
        if (cancelled) return;
        if (error) throw error;
        const rawGroups: Array<{ title: string; task_ids: string[] }> = Array.isArray(data?.groups) ? data.groups : [];
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

  // Slice pending tasks (and their topic groups) into time buckets by task_date.
  const bucketOf = (dateKey: string): Bucket => {
    if (dateKey <= todayKey) return "today"; // includes overdue
    if (dateKey === tomorrowKey) return "tomorrow";
    return "thisWeek";
  };

  const pendingByBucket: PendingByBucket = useMemo(() => {
    const empty = { today: [] as TaskGroup[], tomorrow: [] as TaskGroup[], thisWeek: [] as TaskGroup[] };
    if (pending.length === 0) {
      return { today: null, tomorrow: null, thisWeek: null };
    }
    // Use AI-derived groups if available; otherwise fall back to a single "General" group.
    const groups: TaskGroup[] = pendingGroups ?? [{ title: "General", rows: pending }];
    groups.forEach((g) => {
      const splits: Record<Bucket, TaskRow[]> = { today: [], tomorrow: [], thisWeek: [] };
      g.rows.forEach((r) => splits[bucketOf(r.task_date)].push(r));
      (Object.keys(splits) as Bucket[]).forEach((b) => {
        if (splits[b].length > 0) empty[b].push({ title: g.title, rows: splits[b] });
      });
    });
    return {
      today: empty.today,
      tomorrow: empty.tomorrow,
      thisWeek: empty.thisWeek,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pendingGroups, todayKey, tomorrowKey]);

  const toggleTask = async (row: TaskRow) => {
    if (!user) return;
    const completing = !row.completed;
    setSavingId(row.id);

    if (completing) {
      const updatedRow: TaskRow = { ...row, completed: true, section: "completed:manual", task_date: todayKey };
      setPending((list) => list.filter((r) => r.id !== row.id));
      setBlockers((list) => list.filter((r) => r.id !== row.id));
      setCompletedToday((list) => [updatedRow, ...list]);

      const { error } = await supabase.from("daily_tasks").update({ completed: true, section: "completed:manual", task_date: todayKey }).eq("id", row.id);
      setSavingId(null);

      if (error) {
        toast.error("Couldn't save task status");
        setCompletedToday((list) => list.filter((r) => r.id !== row.id));
        if (row.section.startsWith("pending")) setPending((list) => [row, ...list]);
        else setBlockers((list) => [row, ...list]);
        return;
      }
      setSavedId(row.id);
      setTimeout(() => setSavedId((id) => (id === row.id ? null : id)), 1200);
      toast.success("Task complete");
    } else {
      const restoredRow: TaskRow = { ...row, completed: false, section: "pending", task_date: todayKey };
      setCompletedToday((list) => list.filter((r) => r.id !== row.id));
      setPending((list) => [restoredRow, ...list]);

      const { error } = await supabase.from("daily_tasks").update({ completed: false, section: "pending", task_date: todayKey }).eq("id", row.id);
      setSavingId(null);

      if (error) {
        toast.error("Couldn't restore task");
        setPending((list) => list.filter((r) => r.id !== row.id));
        setCompletedToday((list) => [row, ...list]);
        return;
      }
      setSavedId(row.id);
      setTimeout(() => setSavedId((id) => (id === row.id ? null : id)), 1200);
    }
  };

  const deleteTask = async (row: TaskRow) => {
    if (!user) return;
    setSavingId(row.id);
    const prevPending = pending;
    const prevBlockers = blockers;
    const prevCompletedToday = completedToday;
    const prevCompletedYesterday = completedYesterday;
    setPending((list) => list.filter((r) => r.id !== row.id));
    setBlockers((list) => list.filter((r) => r.id !== row.id));
    setCompletedToday((list) => list.filter((r) => r.id !== row.id));
    setCompletedYesterday((list) => list.filter((r) => r.id !== row.id));

    const { error } = await supabase.from("daily_tasks").delete().eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error("Couldn't remove task");
      setPending(prevPending);
      setBlockers(prevBlockers);
      setCompletedToday(prevCompletedToday);
      setCompletedYesterday(prevCompletedYesterday);
      return;
    }
    toast.success("Task removed");
  };

  const moveTaskToBucket = async (row: TaskRow, bucket: Bucket) => {
    if (!user) return;
    const targetDate =
      bucket === "today" ? todayKey
        : bucket === "tomorrow" ? tomorrowKey
        : weekEndKey; // place "this week" tasks at end of workweek
    const currentBucket = bucketOf(row.task_date);
    if (currentBucket === bucket && row.task_date === targetDate) return;

    const prev = pending;
    setPending((list) =>
      list.map((r) => (r.id === row.id ? { ...r, task_date: targetDate } : r))
    );
    // Update topic groups in place so the row keeps the same group title, just under a new bucket.
    setPendingGroups((groups) =>
      groups
        ? groups.map((g) => ({
            ...g,
            rows: g.rows.map((r) => (r.id === row.id ? { ...r, task_date: targetDate } : r)),
          }))
        : groups
    );

    const { error } = await supabase.from("daily_tasks").update({ task_date: targetDate }).eq("id", row.id);
    if (error) {
      toast.error("Couldn't move task");
      setPending(prev);
      return;
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
        body: { text, today_date: todayKey },
      });
      if (error) throw error;
      const rawItems: Array<{ text: string; when: string | null }> = Array.isArray(data?.items)
        ? data.items.filter((i: any) => i && typeof i.text === "string")
        : [];
      // Dedupe by text while preserving the first when-hint we see.
      const seen: Array<{ text: string; when: string | null }> = [];
      rawItems.forEach((it) => {
        if (seen.some((e) => areTaskTextsEquivalent(e.text, it.text))) return;
        seen.push({ text: it.text.trim(), when: it.when ?? null });
      });
      if (seen.length === 0) {
        toast.error("Couldn't extract any tasks from that text");
        return;
      }
      const rows = seen.map((it) => ({
        user_id: user.id,
        task_date: resolveWhenHint(it.when, today, todayKey),
        section: "pending:manual",
        task_text: it.text,
        completed: false,
      }));
      const { data: inserted, error: insertError } = await supabase.from("daily_tasks").insert(rows).select("*");
      if (insertError) throw insertError;
      setPending((list) => [...list, ...(inserted ?? [])]);
      setNewTasksText("");
      toast.success(`Added ${seen.length} task${seen.length === 1 ? "" : "s"}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to add tasks");
    } finally {
      setAdding(false);
    }
  };

  return (
    <TasksForTodayContext.Provider
      value={{
        selectedDate: today,
        todayKey,
        isViewingToday,
        loading,
        loaded,
        completedYesterday,
        completedToday,
        pending,
        blockers,
        pendingByBucket,
        pendingGroups,
        grouping,
        savingId,
        savedId,
        bucketLabels,
        newTasksText,
        setNewTasksText,
        adding,
        toggleTask,
        deleteTask,
        moveTaskToBucket,
        addMoreTasks,
        reload: load,
      }}
    >
      {children}
    </TasksForTodayContext.Provider>
  );
};
