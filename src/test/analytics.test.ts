import { describe, it, expect } from "vitest";
import { averageCompletionByGroup, completionDays, effectiveGroup, filterByRange, currentStreak, type CompletedTask } from "@/lib/analytics";

const t = (task_date: string, group_title: string | null, analytics_group: string | null = null): CompletedTask => ({
  id: task_date + group_title, task_text: "x", task_date, group_title, analytics_group,
});

describe("analytics", () => {
  it("averages creation-to-completion calendar days separately by effective group", () => {
    const result = averageCompletionByGroup([
      { ...t("2026-11-12", "CSP"), created_at: "2026-11-02T12:00:00" },
      { ...t("2026-11-12", "CSP"), created_at: "2026-11-08T12:00:00" },
      { ...t("2026-10-14", "Old", "Tickets Timeline"), created_at: "2026-10-12T12:00:00" },
    ]);
    expect(result).toEqual([
      { group: "CSP", count: 2, measured: 2, averageDays: 7 },
      { group: "Tickets Timeline", count: 1, measured: 1, averageDays: 2 },
    ]);
  });
  it("counts same-day completion as zero days", () => {
    expect(completionDays({ ...t("2026-11-12", "CSP"), created_at: "2026-11-12T18:00:00" })).toBe(0);
  });
  it("excludes missing, invalid and post-completion creation dates rather than treating them as zero", () => {
    const result = averageCompletionByGroup([
      { ...t("2026-11-12", "CSP"), created_at: "2026-11-08T12:00:00" },
      t("2026-11-12", "CSP"),
      { ...t("2026-11-12", "CSP"), created_at: "invalid" },
      { ...t("2026-11-12", "CSP"), created_at: "2026-11-13T12:00:00" },
    ]);
    expect(result).toEqual([{ group: "CSP", count: 4, measured: 1, averageDays: 4 }]);
  });
  it("uses the selected completion date range for duration averages", () => {
    const tasks = [
      { ...t("2026-11-12", "CSP"), created_at: "2026-10-12T12:00:00" },
      { ...t("2026-11-01", "CSP"), created_at: "2026-10-31T12:00:00" },
    ];
    expect(averageCompletionByGroup(filterByRange(tasks, "7d", new Date(2026, 10, 12)))[0]?.averageDays).toBe(31);
  });
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
