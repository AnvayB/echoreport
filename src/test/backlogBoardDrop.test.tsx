import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksForToday from "@/components/TasksForToday";

const mocks = vi.hoisted(() => ({ move: vi.fn(), moveBucket: vi.fn(), rename: vi.fn(), create: vi.fn() }));
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
    moveTaskToBucket: mocks.moveBucket,
    createBacklogGroup: mocks.create,
  }),
}));

const transfer = {
  effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: () => "task-1",
};

describe("backlog board drag-to-create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves a task into Tomorrow without creating a backlog group", async () => {
    render(<TasksForToday />);
    fireEvent.click(screen.getByRole("button", { name: "Open expanded backlog" }));
    const row = screen.getByText("Review SQE").closest("label");
    if (!row) throw new Error("Task row missing");
    const target = screen.getByLabelText("Tomorrow tasks");
    fireEvent.dragStart(row, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });
    await waitFor(() => expect(mocks.moveBucket).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1" }), "tomorrow",
    ));
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("opens only the board's new-group form and creates the named group", async () => {
    mocks.create.mockResolvedValue(true);
    render(<TasksForToday />);
    fireEvent.click(screen.getByRole("button", { name: "Open expanded backlog" }));
    const board = screen.getByRole("dialog");
    fireEvent.click(within(board).getByRole("button", { name: "New backlog group" }));
    const inputs = screen.getAllByPlaceholderText("e.g. SQE");
    expect(inputs).toHaveLength(1);
    fireEvent.change(inputs[0], { target: { value: "Tickets Timeline" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("Tickets Timeline"));
    await waitFor(() => expect(screen.queryByPlaceholderText("e.g. SQE")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still creates empty groups from the backlog list", async () => {
    mocks.create.mockResolvedValue(true);
    render(<TasksForToday />);
    fireEvent.click(screen.getByRole("button", { name: "New backlog group" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. SQE"), { target: { value: "Project Hub" } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("Project Hub"));
  });

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
describe("splitBoardPanels", () => {
  it("keeps order and puts the last panel in the rightmost column", async () => {
    const { splitBoardPanels } = await import("@/lib/backlogGroups");
    const panels = ["today", "a", "b", "c", "tomorrow"];
    const heights = [100, 300, 300, 300, 100];
    const cols = splitBoardPanels(panels, heights, 3);
    expect(cols.flat()).toEqual(panels);
    expect(cols).toHaveLength(3);
    expect(cols[cols.length - 1][cols[cols.length - 1].length - 1]).toBe("tomorrow");
  });

  it("clamps column count to the panel count", async () => {
    const { splitBoardPanels } = await import("@/lib/backlogGroups");
    const cols = splitBoardPanels(["today", "tomorrow"], [100, 100], 4);
    expect(cols).toEqual([["today"], ["tomorrow"]]);
  });

  it("returns a single column when only one column fits", async () => {
    const { splitBoardPanels } = await import("@/lib/backlogGroups");
    expect(splitBoardPanels(["today", "a", "tomorrow"], [50, 50, 50], 1)).toEqual([["today", "a", "tomorrow"]]);
  });
});
