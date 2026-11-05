import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import ThemeToggle from "@/components/ThemeToggle";

const renderToggle = () => render(
  <ThemeProvider attribute="class" defaultTheme="light" storageKey="echo-report-theme" enableSystem={false}>
    <ThemeToggle />
  </ThemeProvider>
);

afterEach(() => {
  cleanup();
  localStorage.removeItem("echo-report-theme");
  document.documentElement.classList.remove("dark", "light");
});

describe("appearance preference", () => {
  it("saves dark mode and restores it when reopened", async () => {
    const first = renderToggle();
    fireEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
    await waitFor(() => expect(localStorage.getItem("echo-report-theme")).toBe("dark"));
    first.unmount();
    renderToggle();
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  });

  it("allows returning from saved dark mode to light mode", async () => {
    localStorage.setItem("echo-report-theme", "dark");
    renderToggle();
    fireEvent.click(await screen.findByRole("button", { name: "Switch to light mode" }));
    await waitFor(() => expect(localStorage.getItem("echo-report-theme")).toBe("light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});