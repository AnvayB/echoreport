import type { TaskGroup } from "@/components/TasksForTodayContext";

export const nextBacklogGroupTitle = (titles: string[]): string => {
  const used = new Set(titles.map((title) => title.trim().toLowerCase()));
  let title = "New Group";
  let suffix = 2;
  while (used.has(title.toLowerCase())) title = `New Group ${suffix++}`;
  return title;
};

export const canCreateGroupOnDrop = (
  expanded: boolean,
  taskId: string | null,
  overExistingTarget: boolean,
): boolean => expanded && !!taskId && !overExistingTarget;

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
  const extras: TaskGroup[] = [];
  customTitles.forEach((raw) => {
    const title = raw.trim();
    if (!title || seen.has(title.toLowerCase())) return;
    seen.add(title.toLowerCase());
    extras.push({ title, rows: [] });
  });
  return [...taskGroups, ...extras];
};
