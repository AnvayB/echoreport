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

/**
 * Orders groups by a saved title order (case-insensitive). Groups without a
 * saved position keep their relative order and come after the ordered ones.
 */
export const orderBacklogGroups = (groups: TaskGroup[], savedOrder: string[]): TaskGroup[] => {
  if (savedOrder.length === 0) return groups;
  const position = new Map(savedOrder.map((t, i) => [t.toLowerCase(), i]));
  return [...groups].sort((a, b) => {
    const pa = position.get(a.title.toLowerCase());
    const pb = position.get(b.title.toLowerCase());
    if (pa === undefined && pb === undefined) return 0;
    if (pa === undefined) return 1;
    if (pb === undefined) return -1;
    return pa - pb;
  });
};

/** Returns a new title order with `dragged` inserted right before `target`. */
export const moveGroupBefore = (order: string[], dragged: string, target: string): string[] => {
  const without = order.filter((t) => t.toLowerCase() !== dragged.toLowerCase());
  const idx = without.findIndex((t) => t.toLowerCase() === target.toLowerCase());
  if (idx === -1) return [...without, dragged];
  return [...without.slice(0, idx), dragged, ...without.slice(idx)];
};
