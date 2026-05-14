## Goal

Add a right-click (context) menu to each task row in the task list, starting with the ability to toggle a task's IMPORTANT status. The menu is built so more actions can be slotted in later without restructuring.

## Scope

- Applies to pending task rows (Today / Tomorrow / This Week buckets) and Blockers.
- Out of scope for now: completed-task rows. Easy to extend later.

## Behavior

Right-clicking (or long-pressing on touch) a task opens a small menu next to the cursor with:

1. **Mark as important** — when the task is not yet important.
2. **Remove important** — when the task is already important.

Selecting the action immediately:
- Updates the task text in the database (prepends or strips the `!! ` marker that `TaskText` already renders as bold).
- Optimistically updates local state so the row re-bolds/un-bolds without a refetch.

Failure path: on DB error, revert the optimistic change and show a toast.

The existing left-click checkbox toggle, drag-to-move, and X-to-delete behaviors remain unchanged.

## Future-ready menu items (stubs only — not built yet)

The menu component will be structured so we can later add items like:
- Move to Today / Tomorrow / This Week
- Duplicate task
- Copy task text
- Convert to / from Blocker

These are placeholders for the "maybe other features" you mentioned — none are implemented in this round.

## Technical notes

- Use the existing shadcn `ContextMenu` primitive (`src/components/ui/context-menu.tsx` is already in the project).
- Wrap each task row in `TasksForToday.tsx` `renderCheckboxRow` with `<ContextMenu>` / `<ContextMenuTrigger asChild>` so the existing `<label>` keeps its drag/click behavior.
- Add a `setTaskImportant(row, important: boolean)` method to `TasksForTodayProvider` that:
  - Computes the new `task_text` (`!! ` prefix add/strip, idempotent — also strips a leading literal `IMPORTANT` token if present).
  - Updates `pending` and `blockers` state arrays optimistically.
  - Calls `supabase.from("daily_tasks").update({ task_text }).eq("id", row.id)`.
  - Reverts state and toasts on error.
- Expose it through `TasksForTodayContext` and consume in `TasksForToday.tsx`.
- Detection of "is important" reuses the same regex `TaskText` uses (`/^\s*(?:!!\s*|important[:\s-]+)/i`) — extracted into a tiny helper in `src/lib/taskUtils.ts` so both renderer and provider stay in sync.

## Files touched

- `src/lib/taskUtils.ts` — add `isTaskImportant` + `toggleImportantInText` helpers.
- `src/components/TaskText.tsx` — use the shared helper (no behavior change).
- `src/components/TasksForTodayContext.ts` — add `setTaskImportant` to context type.
- `src/components/TasksForTodayProvider.tsx` — implement `setTaskImportant`.
- `src/components/TasksForToday.tsx` — wrap rows in `ContextMenu` with the Mark / Remove important item.

No database schema changes.
