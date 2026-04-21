import { createContext, useContext } from "react";

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
  pendingGroups: TaskGroup[] | null;
  grouping: boolean;
  savingId: string | null;
  savedId: string | null;
  newTasksText: string;
  setNewTasksText: (v: string) => void;
  adding: boolean;
  toggleTask: (row: TaskRow) => Promise<void>;
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
