import React, { createContext, useContext } from "react";

export interface TaskRow {
  id: string;
  task_text: string;
  completed: boolean;
  section: string;
  task_date: string;
}

export interface TaskGroup {
  title: string;
  rows: TaskRow[];
}

export type Bucket = "today" | "tomorrow" | "thisWeek";

export interface PendingByBucket {
  today: TaskGroup[] | null;
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
  toggleTask: (row: TaskRow) => Promise<void>;
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
