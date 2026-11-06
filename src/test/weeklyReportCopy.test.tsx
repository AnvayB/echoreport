import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WeeklyReportGenerator from "@/components/WeeklyReportGenerator";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "report-owner" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      const result = { data: table === "report_templates" ? [{ id: "template", name: "Standard", template: "Weekly", is_default: true }] : [] };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "gte", "lte", "gt", "lt", "order", "limit"]) query[method] = () => query;
      query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      return query;
    },
  },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("weekly report copy and Outlook handoff", () => {
  it("copies only the formatted body, then opens Outlook with the retained subject without copying again", async () => {
    mocks.invoke.mockResolvedValue({ data: { report: "Subject: Weekly Report — November 6\n\n**Completed Tasks**\n- Finished review" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
    render(<WeeklyReportGenerator currentWeek={new Date(2026, 10, 6)} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Weekly Report" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Weekly Report" }));
    const copy = await screen.findByRole("button", { name: "Copy" });
    await waitFor(() => expect(copy).toBeEnabled());
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Completed Tasks\n- Finished review"));
    fireEvent.click(await screen.findByRole("button", { name: "Outlook Web" }));
    expect(openWindow).toHaveBeenCalledWith(
      "https://outlook.office.com/mail/deeplink/compose?subject=" + encodeURIComponent("Weekly Report — November 6"),
      "_blank", "noopener,noreferrer",
    );
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});