import type { TaskGroup } from "@/components/TasksForTodayContext";

/**
 * Merges manually created (empty) backlog group titles into the task-backed
 * groups. Custom titles that collide with an existing group (case-insensitive)
 * are skipped so no duplicate panel appears.
 */
export const mergeBacklogGroups = (
  taskGroups: TaskGroup[],
  customTitles: string[]
): TaskGroup[] => {
  const seen = new Set(taskGroups.map((g) => g.title.toLowerCase()));
  const extras = customTitles
    .filter((t) => t.trim() && !seen.has(t.trim().toLowerCase()))
    .map((t) => ({ title: t.trim(), rows: [] as TaskGroup["rows"] }));
  return [...taskGroups, ...extras];
};
