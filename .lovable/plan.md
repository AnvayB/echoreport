

# Fix Carryover: Make Tomorrow's Tasks Reflect Yesterday's Reality

## The Problem

Today's task list is missing some tasks you didn't complete yesterday and showing some you did complete. Three root causes:

1. **No row, no carryover.** Carryover comes from the `daily_tasks` table. If you never clicked "What are my tasks for today?" yesterday, no rows were ever written for yesterday — so unchecked items from yesterday's plan can't carry over.
2. **EOD "Pending / Tomorrow" isn't injected as tasks.** When you write your EOD entry and list pending work in the "Pending / Tomorrow" field, that text is only fed to the AI as free prose — it isn't seeded as actual `daily_tasks` rows that can be carried, deduped, or marked complete.
3. **Completed items leak into today.** The previous day's `daily_entries.pending_tasks` text is written *before* you check things off. If you complete a task afterwards, the AI still sees the stale "pending" text and replays it into today — without reconciling it against the checkbox state.

## The Fix

### 1. Auto-seed tasks from EOD entry
When the user saves a daily entry, immediately call AI to parse the `pending_tasks` field (and surface blockers) into structured task rows in `daily_tasks` for **that same day**. This guarantees every day has a baseline set of rows that can be checked off and carried forward — even if the user never opens "Tasks for Today" the next morning.

- Reuse the existing `ai-parse-tasks` edge function.
- Insert rows under section `"Pending for Today › From EOD Entry"`, completed = false.
- Skip if rows already exist for that day+section to avoid duplication on re-save.

### 2. Strengthen the carryover query
In `TasksForToday.fetchTasks`:
- Keep the existing "all unchecked tasks across all prior days" query (already correct — pulls from any past date, not just yesterday).
- **Also** pull *yesterday's completed* tasks explicitly so we can pass them as an exclusion list to the AI.
- Pull yesterday's `daily_entries.pending_tasks` AND `accomplishments` text and pass both — the AI already gets `entry`, but we'll make the prompt stricter.

### 3. Fix the AI prompt to honor completion state
Update `ai-daily-tasks` system prompt to add an explicit rule:
- The "Pending / Tomorrow" text in the entry is a *snapshot* — if any of those items appear in the `completed_tasks` list with `completed: true`, **move them to "Completed Yesterday"**, do not include them in today's pending.
- Carryover items (unchecked from past days) take priority over re-extracting tasks from prose.
- Never invent new tasks not grounded in either: (a) the EOD entry, (b) explicit carryover, (c) completed_tasks marked false.

### 4. Backfill safety net
On `fetchTasks`, if yesterday's `daily_entries` exists but has zero `daily_tasks` rows, run the EOD-parse step retroactively before generating today's plan. This handles existing data so the user sees the fix immediately, not just going forward.

## Files Changed

| File | Change |
|---|---|
| `src/components/DailyEntryPanel.tsx` | After successful save, call `ai-parse-tasks` on `pending_tasks` and insert rows into `daily_tasks` for that date. |
| `src/components/TasksForToday.tsx` | Add backfill step in `fetchTasks`; pass yesterday's completed task texts as an exclusion list to the edge function. |
| `supabase/functions/ai-daily-tasks/index.ts` | Tighten prompt: reconcile EOD prose against checkbox state; never re-list completed items as pending; treat carryover as authoritative. |

## Technical Notes

- No DB schema changes needed — `daily_tasks` already supports this.
- EOD seeding runs only once per day per save (idempotent guard via existence check).
- Carryover dedupe stays text-based, but exclusion list now suppresses items the user explicitly completed yesterday.

