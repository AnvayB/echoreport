import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksForToday from "@/components/TasksForToday";

const mocks = vi.hoisted(() => ({ move: vi.fn(), rename: vi.fn() }));
vi.mock("@/components/TaskText", () => ({ default: ({ text }: { text: string }) => <>{text}</> }));
vi.mock("@/components/VoiceInput", () => ({ default: () => null }));
vi.mock("@/components/TasksForTodayContext", () => ({
  useTasksForToday: () => ({
    loaded: true, loading: false, completedYesterday: [], completedToday: [], blockers: [],
    pending: [{ id: "task-1", task_text: "Review SQE", completed: false, task_date: "2026-10-20", group_title: "SQE", section: "pending" }],
    pendingByBucket: {
      backlog: [{ title: "SQE", rows: [{ id: "task-1", task_text: "Review SQE", completed: false, task_date: "2026-10-20", group_title: "SQE", section: "pending" }] }, { title: "New Group", rows: [] }],
      today: [], tomorrow: [], thisWeek: [],
    },
    bucketLabels: { backlog: "Backlog", today: "Today", tomorrow: "Tomorrow", thisWeek: "This Week" },
    backlogCustomGroups: ["New Group"], duplicateClusters: [], newTasksText: "",
    moveTaskToGroup: mocks.move, renameBacklogGroup: mocks.rename,
  }),
}));

const transfer = {
  effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: () => "task-1",
};

describe("backlog board drag-to-create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the dragged task to a distinct new group on an empty-space drop", async () => {
    render(<TasksForToday />);
    fireEvent.click(screen.getByRole("button", { name: "Open expanded backlog" }));
    const row = screen.getByText("Review SQE").closest("label");
    if (!row) throw new Error("Task row missing");
    fireEvent.dragStart(row, { dataTransfer: transfer });
    const workspace = screen.getByLabelText("Backlog board workspace");
    fireEvent.dragOver(workspace, { dataTransfer: transfer, clientX: 600, clientY: 500 });
    fireEvent.drop(workspace, { dataTransfer: transfer });
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1" }), "New Group 2",
    ));
  });

  it("keeps existing-group drops separate from new-group creation", async () => {
    render(<TasksForToday />);
    fireEvent.click(screen.getByRole("button", { name: "Open expanded backlog" }));
    const row = screen.getByText("Review SQE").closest("label");
    const target = screen.getByText("New Group").closest("[data-board-drop-target]");
    if (!row || !target) throw new Error("Drop target missing");
    fireEvent.dragStart(row, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });
    await waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(1));
    expect(mocks.move).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), "New Group");
  });

  it("does not create a group when a task is dropped outside groups in list view", () => {
    const { container } = render(<TasksForToday />);
    fireEvent.click(screen.getByText("Backlog"));
    const row = screen.getByText("Review SQE").closest("label");
    if (!row) throw new Error("Task row missing");
    fireEvent.dragStart(row, { dataTransfer: transfer });
    fireEvent.drop(container, { dataTransfer: transfer });
    expect(mocks.move).not.toHaveBeenCalled();
  });
});