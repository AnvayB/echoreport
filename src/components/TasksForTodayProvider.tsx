import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPreviousWorkday, formatDateKey } from "@/lib/weekUtils";
import { dedupeTaskTexts, mergeDuplicateTaskRows } from "@/lib/taskUtils";
import { toast } from "sonner";
import { isSameDay } from "date-fns";
import {
  TasksForTodayContext,
  type TaskRow,
  type TaskGroup,
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
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("completed", false).in("section", ["pending", "pending:manual"]).lte("task_date", todayKey).order("task_date", { ascending: true }),
      supabase.from("daily_tasks").select("*").eq("user_id", user.id).eq("completed", false).eq("section", "blocker").lte("task_date", todayKey).order("task_date", { ascending: true }),
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

  const addMoreTasks = async () => {
    if (!user) return;
    const text = newTasksText.trim();
    if (!text) {
      toast.error("Please enter some tasks first");
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-tasks", { body: { text } });
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
      const { data: inserted, error: insertError } = await supabase.from("daily_tasks").insert(rows).select("*");
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
        pendingGroups,
        grouping,
        savingId,
        savedId,
        newTasksText,
        setNewTasksText,
        adding,
        toggleTask,
        addMoreTasks,
        reload: load,
      }}
    >
      {children}
    </TasksForTodayContext.Provider>
  );
};
