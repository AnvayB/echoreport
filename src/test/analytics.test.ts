import { describe, it, expect } from "vitest";
import { effectiveGroup, filterByRange, currentStreak, type CompletedTask } from "@/lib/analytics";

const t = (task_date: string, group_title: string | null, analytics_group: string | null = null): CompletedTask => ({
  id: task_date + group_title, task_text: "x", task_date, group_title, analytics_group,
});

describe("analytics", () => {
  it("keeps real groups from Oct 15 onward", () => {
    expect(effectiveGroup(t("2026-10-15", "SQE", "AI Guess"))).toBe("SQE");
  });
  it("uses AI guess before Oct 15", () => {
    expect(effectiveGroup(t("2026-10-14", "Old AI", "Jira"))).toBe("Jira");
  });
  it("1 week range includes today and 6 prior days", () => {
    const today = new Date(2026, 10, 9);
    const r = filterByRange([t("2026-11-03", null), t("2026-11-02", null)], "7d", today);
    expect(r.map((x) => x.task_date)).toEqual(["2026-11-03"]);
  });
  it("streak counts consecutive days", () => {
    expect(currentStreak(["2026-11-09", "2026-11-08", "2026-11-06"], new Date(2026, 10, 9))).toBe(2);
  });
});
