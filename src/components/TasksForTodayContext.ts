import React, { createContext, useContext } from "react";

export interface TaskRow {
  id: string;
  task_text: string;
  completed: boolean;
  section: string;
  task_date: string;
  created_at?: string;
}

export interface TaskGroup {
  title: string;
  rows: TaskRow[];
}

export interface DuplicateCluster {
  key: string;
  reason: string;
  rows: TaskRow[];
}

export type Bucket = "today" | "backlog" | "tomorrow" | "thisWeek";

export interface PendingByBucket {
  today: TaskGroup[] | null;
  backlog: TaskGroup[] | null;
  tomorrow: TaskGroup[] | null;
  thisWeek: TaskGroup[] | null;
}

export interface TasksForTodayContextValue {
  selectedDate: Date;
  todayKey: string;
  isViewingToday: boolean;
  loading: boolean;
  loaded: boolean;
  completedYesterday: TaskRow[];
  completedToday: TaskRow[];
  pending: TaskRow[];
  blockers: TaskRow[];
  pendingByBucket: PendingByBucket;
  pendingGroups: TaskGroup[] | null; // legacy: flat groups across all buckets
  grouping: boolean;
  savingId: string | null;
  savedId: string | null;
  bucketLabels: Record<Bucket, string>;
  newTasksText: string;
  setNewTasksText: React.Dispatch<React.SetStateAction<string>>;
  adding: boolean;
  duplicateClusters: DuplicateCluster[];
  resolveDuplicateCluster: (key: string, keepId: string) => Promise<void>;
  dismissDuplicateCluster: (key: string) => void;
  toggleTask: (row: TaskRow) => Promise<void>;
  editTaskText: (row: TaskRow, newText: string) => Promise<void>;
  deleteTask: (row: TaskRow) => Promise<void>;
  moveTaskToBucket: (row: TaskRow, bucket: Bucket) => Promise<void>;
  addMoreTasks: () => Promise<void>;
  reload: () => Promise<void>;
}

export const TasksForTodayContext =
  createContext<TasksForTodayContextValue | null>(null);

export const useTasksForToday = () => {
  const ctx = useContext(TasksForTodayContext);
  if (!ctx) throw new Error("useTasksForToday must be used within TasksForTodayProvider");
  return ctx;
};
