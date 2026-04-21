

# Layout Restructure: Focused "Tasks for Today" + Modal Weekly Report

## Goal

Reorganize the dashboard so the middle column is laser-focused on what's actionable *right now* (pending tasks + EOD entry), push retrospective sections to the side columns, and turn the weekly report into a centered modal with edit/copy/download.

## New Layout

```text
┌─────────────────────┬──────────────────────────┬──────────────────────┐
│ Weekly Calendar     │ Tasks for Today          │ Weekly Report        │
│ (week nav + days)   │   • Pending for Today    │   [Generate] button  │
│                     │   • Blockers & Follow-ups│                      │
├─────────────────────┤                          ├──────────────────────┤
│ Completed Yesterday │ Daily Entry Panel        │ Completed Today      │
│ (read-only list)    │ (brain dump + organize)  │ (read-only list)     │
└─────────────────────┴──────────────────────────┴──────────────────────┘

         Click "Generate Weekly Report" → centered modal:
         ┌────────────────────────────────────┐
         │ Weekly Report — <week label>    ✕  │
         │ ┌────────────────────────────────┐ │
         │ │ <editable textarea, 20 rows>   │ │
         │ └────────────────────────────────┘ │
         │ [Copy] [Download .md] [Regenerate] │
         │                       [Save Draft] │
         └────────────────────────────────────┘
```

## What Changes

### 1. Split `TasksForToday.tsx` into three render slots
The component currently renders all four sections (Completed Yesterday, Pending, Blockers, Completed Today) in one card. Refactor it so each section can be rendered independently in different grid columns:

- Introduce a `section` prop: `"pending"` (default — pending + blockers, the "Tasks for Today" header), `"completedYesterday"`, or `"completedToday"`.
- All data fetching, dedupe, AI grouping, and checkbox-toggle logic stays in one place via a shared hook (`useTasksForToday(selectedDate)`) so the three mounted instances share state and a single set of queries — not three duplicate fetches.
- Each rendered variant only shows its own section's container (keeps the grey-bg/black-border styling already in place).

### 2. `Dashboard.tsx` grid restructure
Change the three columns so each is a vertical stack:

- **Left column**: Week nav + `WeekDayCard` list, then `<TasksForToday section="completedYesterday" />` underneath.
- **Middle column**: `<TasksForToday section="pending" />` (header reads "Tasks for Today", contains pending + blockers + "Add more tasks"), then `<DailyEntryPanel />` underneath.
- **Right column**: `<WeeklyReportGenerator />` (now just a trigger card), then `<TasksForToday section="completedToday" />` underneath.

Selected-day state and `loadEntries` callback stay in `Dashboard` and are passed down unchanged.

### 3. `WeeklyReportGenerator.tsx` becomes a modal trigger
- The card now shows just the title + a single "Generate Weekly Report" button.
- Clicking it opens a `Dialog` (shadcn `dialog.tsx` — already in the project) sized `max-w-3xl`, containing:
  - Header: "Weekly Report — <week label>"
  - Loading spinner while generating
  - Editable `Textarea` (20 rows, mono font) once draft arrives
  - Footer actions: **Copy**, **Download .md**, **Regenerate**, **Save Draft**
- Modal stays open across regenerate/save so the user can iterate. Closing the modal preserves the in-memory draft for that session.

### 4. New "Download .md" action
- Generate a `Blob` from the current draft text with type `text/markdown`.
- Filename: `weekly-report-<week-start-key>.md` (e.g. `weekly-report-2026-04-20.md`).
- Trigger download via a temporary `<a>` element — no dependency added.

## Technical Notes

- **No DB or edge-function changes.** Pure UI restructure.
- **Shared task state**: extracting a `useTasksForToday` hook is required to avoid three independent fetches and three independent AI-grouping calls when the same component is mounted three times. The hook owns: rows, AI groups, loading flags, and the `toggleTask` / `addTasks` mutations. The three section variants subscribe to the same hook instance via React context (a small `TasksForTodayProvider` mounted once in `Dashboard`, wrapping the three columns).
- **Section visibility rules unchanged**: "Completed Yesterday" still only renders when `selectedDate` is today; "Completed Today" still only renders when there are completed-today rows. When hidden, that grid slot collapses (no empty bordered box).
- **Responsive**: on `md` (2-col) and below, the three columns stack as before — the side sections appear after their parent column's primary content, so the reading order remains: calendar → completed yesterday → tasks for today → daily entry → weekly report → completed today.
- **Modal accessibility**: shadcn `Dialog` provides focus trap, ESC-to-close, and overlay click-to-close out of the box.

## Files Changed

| File | Change |
|---|---|
| `src/components/TasksForToday.tsx` | Add `section` prop; extract data/mutations into a context-backed hook so multiple mounted instances share state. |
| `src/components/TasksForTodayProvider.tsx` *(new)* | Provider + `useTasksForToday` hook owning fetch, dedupe, AI grouping, toggle, add. |
| `src/pages/Dashboard.tsx` | Wrap columns in provider; place three `<TasksForToday section=…/>` instances in the new layout. |
| `src/components/WeeklyReportGenerator.tsx` | Convert inline card body to a `Dialog`-based modal; add Download .md action. |

