

# Make Tasks for Today Deterministic

## What's Actually Wrong

The current flow leans on the AI to *re-decide* every morning what's pending vs. completed by re-reading yesterday's prose. That's why completed items keep reappearing — the LLM rewrites the world from scratch each refresh, and fuzzy text matching can't reliably suppress them.

The fix: make `daily_tasks` the single source of truth. The AI is only used **once**, when you parse the EOD brain dump, to extract structured task items. After that, everything is deterministic: a checkbox flips a row's `completed` flag, and "tomorrow's tasks" is just a SQL query, not an LLM call.

## The New Model

Each task is a row in `daily_tasks` with: `task_text`, `task_date` (the day it first appeared), `section` (`pending` | `blocker` | `completed`), `completed` (bool). Tasks are never re-created or re-worded — they're carried forward by reference until checked off.

```text
EOD brain dump (Mon)
   │  AI parse-entry → accomplishments / pending / blockers / notes (saved to daily_entries)
   │  AI parse-tasks → structured items
   ▼
daily_tasks rows for Mon:
   - accomplishments  → section=completed,  completed=true
   - pending          → section=pending,    completed=false
   - blockers         → section=blocker,    completed=false

Tue morning "Tasks for Today":
   SELECT * FROM daily_tasks
   WHERE user_id=me AND completed=false AND task_date < today
   → grouped by original section, NO AI call
   + SELECT completed=true AND task_date=yesterday → "Completed Yesterday"

Tue: user checks a box → UPDATE that row's completed=true. Done.
Tue EOD brain dump → new tasks appended; nothing is re-parsed or re-decided.
```

## What Changes

### 1. EOD entry save becomes the *only* place tasks are created (`DailyEntryPanel.tsx`)
On save, after upserting `daily_entries`:
- Call `ai-parse-tasks` on **accomplishments** → insert as `section=completed, completed=true, task_date=<entry date>`
- Call `ai-parse-tasks` on **pending_tasks** → insert as `section=pending, completed=false, task_date=<entry date>`
- Call `ai-parse-tasks` on **blockers** → insert as `section=blocker, completed=false, task_date=<entry date>`
- Idempotent guard: delete prior rows for that `(user, task_date)` that came from EOD parsing before re-inserting (so editing the entry re-syncs).

### 2. "Tasks for Today" stops calling the AI (`TasksForToday.tsx`)
Replace the entire `fetchTasks` + `ai-daily-tasks` pipeline with three plain queries:
- **Completed Yesterday**: `daily_tasks` where `task_date = previous workday AND completed = true`
- **Pending for Today**: all `daily_tasks` where `completed = false AND section = 'pending' AND task_date <= today` (carries forward automatically; nothing to dedupe — they're the same rows)
- **Blockers & Follow-ups**: same as above with `section = 'blocker'`

No `persistTasks`, no row deletion/recreation, no AI prompt, no exclusion list, no fuzzy matching. The "Refresh" button just re-runs the queries.

### 3. Checkbox toggle stays one-row UPDATE
Already works — but now the row's identity is stable (it's the original row, not a re-created copy), so checking it once means it stays checked forever and disappears from "Pending for Today" the next day automatically.

### 4. "Add More Tasks" inserts directly
Same as today, but writes `section=pending, task_date=today, completed=false`. No subsection naming — it's just another pending row.

### 5. Weekly report uses `daily_tasks` + entries (`ai-weekly-report`)
Pass the week's `daily_tasks` rows alongside `daily_entries` so the AI can ground "completed" / "carryover" in actual checkbox state, not just prose. EOD text still feeds highlights/lowlights/notes.

### 6. Remove the now-unused `ai-daily-tasks` edge function
It's no longer called.

### 7. One-time backfill for existing data
On first load after deploy, for each `daily_entries` row that has zero `daily_tasks` rows of section `completed`/`pending`/`blocker`, parse and insert them. Runs silently in the background once.

## Technical Notes

- **Section values change**: from free-form (`"Pending for Today › Databricks…"`) to a strict enum-like set: `completed`, `pending`, `blocker`, `note`. UI grouping/subsections become a pure render decision (e.g. group pending by source date, or skip subsections entirely for now).
- **No DB schema change required** — `section` is already `text`. We just standardize the values.
- **Migration of existing rows**: a one-shot SQL update normalizes legacy section strings (`section ILIKE 'Completed Yesterday'` → `completed`; `ILIKE 'Pending for Today%'` → `pending`; `ILIKE 'Carryover%'` → `blocker`). This is safe because rows already carry the right `completed` flag.
- **AI calls per day go from ~4 to 1** (only `ai-parse-entry` + the three small `ai-parse-tasks` calls on save), making the experience faster and predictable.
- **Re-saving an EOD entry** re-parses and replaces only that day's EOD-sourced rows, preserving any tasks the user manually added or checked off elsewhere (filter by a `source` marker stored in `section` or by `task_date = entry_date AND id NOT IN (...manually added...)`). Simplest: store `source` in the section name as `pending`, `pending:manual`, etc., and only delete `pending`/`completed`/`blocker` (not `:manual`) on re-sync.

## Files Changed

| File | Change |
|---|---|
| `src/components/DailyEntryPanel.tsx` | On save, parse accomplishments/pending/blockers into structured `daily_tasks` rows. Idempotent re-sync. |
| `src/components/TasksForToday.tsx` | Remove all AI calls, exclusion lists, fuzzy matching. Render directly from three SQL queries. |
| `supabase/functions/ai-weekly-report/index.ts` | Accept and incorporate `daily_tasks` rows alongside entries. |
| `src/components/WeeklyReportGenerator.tsx` | Fetch the week's `daily_tasks` and pass to the edge function. |
| `supabase/functions/ai-daily-tasks/index.ts` | Delete (no longer used). |
| New migration | Normalize legacy `section` values in `daily_tasks`. |

