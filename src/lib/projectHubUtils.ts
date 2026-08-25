import type { Database } from "@/integrations/supabase/types";

export type ProjectStatus = Database["public"]["Enums"]["ph_project_status"];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "not_started",
  "incomplete",
  "semi_complete",
  "complete",
];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  not_started: "Not Started",
  incomplete: "Incomplete",
  semi_complete: "Semi-Complete",
  complete: "Complete",
};

export const STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  incomplete: "bg-destructive/15 text-destructive",
  semi_complete: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  complete: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export interface RegionCounts {
  complete: number;
  semiComplete: number;
  incomplete: number;
  notStarted: number;
  total: number;
}

export function emptyCounts(): RegionCounts {
  return { complete: 0, semiComplete: 0, incomplete: 0, notStarted: 0, total: 0 };
}

export function tallyCounts(statuses: ProjectStatus[]): RegionCounts {
  const counts = emptyCounts();
  for (const status of statuses) {
    counts.total += 1;
    if (status === "complete") counts.complete += 1;
    else if (status === "semi_complete") counts.semiComplete += 1;
    else if (status === "incomplete") counts.incomplete += 1;
    else counts.notStarted += 1;
  }
  return counts;
}

export interface ManualRegionCounts {
  manual_complete: number;
  manual_semi_complete: number;
  manual_incomplete: number;
  manual_total: number;
}

export interface RegionWithSnapshot extends ManualRegionCounts {
  id: string;
  name: string;
  notes: string;
}

/**
 * Real ph_projects rows take priority once they exist; until then, fall back to the
 * manual snapshot counts entered from outside tracking (spreadsheets, notes, etc.).
 */
export function effectiveCounts(
  region: ManualRegionCounts,
  projectStatuses: ProjectStatus[]
): RegionCounts {
  if (projectStatuses.length > 0) return tallyCounts(projectStatuses);
  return {
    complete: region.manual_complete,
    semiComplete: region.manual_semi_complete,
    incomplete: region.manual_incomplete,
    notStarted: Math.max(
      region.manual_total - region.manual_complete - region.manual_semi_complete - region.manual_incomplete,
      0
    ),
    total: region.manual_total,
  };
}
