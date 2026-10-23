import { describe, expect, it } from "vitest";
import { canCreateGroupOnDrop, mergeBacklogGroups, nextBacklogGroupTitle } from "@/lib/backlogGroups";
import type { TaskGroup } from "@/components/TasksForTodayContext";

const group = (title: string, count: number): TaskGroup => ({
  title,
  rows: Array.from({ length: count }, (_, i) => ({
    id: `${title}-${i}`,
    task_text: "task",
    completed: false,
    section: "pending",
    task_date: "2026-10-20",
  })),
});

describe("mergeBacklogGroups", () => {
  it("appends custom titles as empty groups after task-backed groups", () => {
    const merged = mergeBacklogGroups([group("SQE", 2)], ["Tickets Timeline", "Project Hub"]);
    expect(merged.map((g) => g.title)).toEqual(["SQE", "Tickets Timeline", "Project Hub"]);
    expect(merged[1].rows).toHaveLength(0);
    expect(merged[2].rows).toHaveLength(0);
  });

  it("skips custom titles that duplicate an existing group, case-insensitively", () => {
    const merged = mergeBacklogGroups([group("SQE", 1)], ["sqe", "New Group"]);
    expect(merged.map((g) => g.title)).toEqual(["SQE", "New Group"]);
  });

  it("skips duplicate custom titles within the custom list itself", () => {
    const merged = mergeBacklogGroups([], ["Alpha", "alpha"]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Alpha");
  });

  it("keeps task-backed groups untouched", () => {
    const taskGroups = [group("A", 2), group("B", 1)];
    const merged = mergeBacklogGroups(taskGroups, ["C"]);
    expect(merged[0]).toEqual(taskGroups[0]);
    expect(merged[1]).toEqual(taskGroups[1]);
  });
});

describe("expanded backlog empty-space drops", () => {
  it("creates a new group only in expanded view", () => {
    expect(canCreateGroupOnDrop(true, "task-1", false)).toBe(true);
    expect(canCreateGroupOnDrop(false, "task-1", false)).toBe(false);
  });
  it("does not create groups over existing drop targets", () => {
    expect(canCreateGroupOnDrop(true, "task-1", true)).toBe(false);
    expect(canCreateGroupOnDrop(true, null, false)).toBe(false);
  });
  it("chooses a distinct title for each new group", () => {
    expect(nextBacklogGroupTitle([])).toBe("New Group");
    expect(nextBacklogGroupTitle(["new group", "New Group 2"])).toBe("New Group 3");
  });
});
