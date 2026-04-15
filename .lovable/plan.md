

# Interactive Task Checkboxes for "Tasks for Today"

## Overview
Replace the markdown bullet-point rendering in Tasks for Today with interactive checkboxes. Checked tasks get a strikethrough. Task completion status is persisted in a new database table and fed as context to the AI when generating daily reports and next-day tasks.

## Database Change

**New table: `daily_tasks`**
Stores individual parsed tasks with their completion status.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | NOT NULL |
| task_date | date | NOT NULL (the day the tasks are for) |
| section | text | NOT NULL (e.g. "Completed Yesterday", "Pending for Today", "Carryover, Blockers & Follow-ups") |
| task_text | text | NOT NULL |
| completed | boolean | NOT NULL, default false |
| created_at | timestamptz | default now() |

RLS: users can only CRUD their own rows (same pattern as daily_entries).

## Edge Function Change: `ai-daily-tasks`

- Update the system prompt to return **structured JSON** instead of markdown. The response will be an object with section keys mapping to arrays of task strings.
- Accept an optional `completed_tasks` field in the request body so prior completion data can inform the AI.

Example JSON output:
```json
{
  "sections": [
    { "title": "Completed Yesterday", "items": ["Task A", "Task B"] },
    { "title": "Pending for Today", "items": ["Task C"] },
    { "title": "Carryover, Blockers & Follow-ups", "items": ["Task D"] }
  ]
}
```

## Frontend: `TasksForToday.tsx`

1. **Parse AI response** into a structured state: an array of sections, each with a title and items (each item has text + completed boolean).
2. **Render each item as a Checkbox** (using the existing `Checkbox` component) with the task text next to it. Checked items get `line-through` styling.
3. **On toggle**, update the `daily_tasks` table (upsert the completion status) and update local state.
4. **On load**, check the `daily_tasks` table for existing tasks for today to restore prior state.

## Context Feed-Through

- **`ai-daily-tasks` edge function**: When generating tasks, also query `daily_tasks` for the previous workday and include completion status in the prompt (e.g., "Task X - completed", "Task Y - not completed").
- **Daily entry panel**: No changes needed -- the AI already reads from `daily_entries`. The new task completion data provides supplementary context through the tasks function.

## Technical Details

- Migration SQL creates `daily_tasks` table with RLS policies
- `TasksForToday.tsx` switches from ReactMarkdown to custom rendering with Checkbox components
- Edge function returns JSON; falls back gracefully if parsing fails
- Completion toggles are saved immediately via upsert to `daily_tasks`

