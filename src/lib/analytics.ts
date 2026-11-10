import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";

export const LOCKED_CUTOFF = "2026-10-15";
export type RangeKey = "7d" | "30d" | "month" | "all";

export interface CompletedTask {
  id: string;
  task_text: string;
  task_date: string;
  group_title: string | null;
  analytics_group: string | null;
}

export const effectiveGroup = (t: CompletedTask): string => {
  if (t.task_date >= LOCKED_CUTOFF && t.group_title?.trim()) return t.group_title.trim();
  if (t.analytics_group?.trim()) return t.analytics_group.trim();
  return "Uncategorized";
};

export const needsClassification = (t: CompletedTask): boolean =>
  !(t.task_date >= LOCKED_CUTOFF && t.group_title?.trim()) && !t.analytics_group?.trim();

export const rangeStart = (range: RangeKey, today: Date): string | null => {
  if (range === "7d") return format(subDays(today, 6), "yyyy-MM-dd");
  if (range === "30d") return format(subDays(today, 29), "yyyy-MM-dd");
  if (range === "month") return format(startOfMonth(today), "yyyy-MM-dd");
  return null;
};

export const filterByRange = (tasks: CompletedTask[], range: RangeKey, today: Date) => {
  const start = rangeStart(range, today);
  const end = format(today, "yyyy-MM-dd");
  return tasks.filter((t) => (!start || t.task_date >= start) && t.task_date <= end);
};

export const isImportant = (t: CompletedTask) => t.task_text.startsWith("!! ");

/** Consecutive days ending today (or yesterday) with ≥1 completion. */
export const currentStreak = (dates: string[], today: Date): number => {
  const set = new Set(dates);
  let d = today;
  if (!set.has(format(d, "yyyy-MM-dd"))) d = subDays(d, 1);
  let n = 0;
  while (set.has(format(d, "yyyy-MM-dd"))) { n++; d = subDays(d, 1); }
  return n;
};

export const countByGroup = (tasks: CompletedTask[]) => {
  const m = new Map<string, number>();
  tasks.forEach((t) => { const g = effectiveGroup(t); m.set(g, (m.get(g) ?? 0) + 1); });
  return [...m.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count);
};

/** Time series with one key per top group plus "Other". */
export const buildSeries = (tasks: CompletedTask[], range: RangeKey, today: Date, topN = 6) => {
  const counts = countByGroup(tasks);
  const top = counts.slice(0, topN).map((c) => c.group);
  const keys = counts.length > topN ? [...top, "Other"] : top;
  const startStr = rangeStart(range, today) ?? tasks.reduce((m, t) => (t.task_date < m ? t.task_date : m), format(today, "yyyy-MM-dd"));
  const start = parseISO(startStr);
  const weekly = differenceInCalendarDays(today, start) > 45;
  const bucketOf = (ds: string) => format(weekly ? startOfWeek(parseISO(ds), { weekStartsOn: 1 }) : parseISO(ds), "yyyy-MM-dd");
  const buckets: Record<string, Record<string, number | string>> = {};
  let d = weekly ? startOfWeek(start, { weekStartsOn: 1 }) : start;
  while (d <= today) {
    const k = format(d, "yyyy-MM-dd");
    buckets[k] = { date: k, ...Object.fromEntries(keys.map((g) => [g, 0])) };
    d = addDays(d, weekly ? 7 : 1);
  }
  tasks.forEach((t) => {
    const b = buckets[bucketOf(t.task_date)];
    if (!b) return;
    const g = top.includes(effectiveGroup(t)) ? effectiveGroup(t) : "Other";
    b[g] = (b[g] as number) + 1;
  });
  return { data: Object.values(buckets), keys, weekly };
};
