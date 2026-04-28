## Goal

Let you drag any pending task into one of three time buckets — **Today**, **Tomorrow**, or **This Week** — while still showing your AI-generated topic groups (e.g. "Databricks Integration", "Jira Sync") inside each bucket.

## The key idea (how groupings survive)

Time bucket and topic group are **two independent dimensions**:

- **Time bucket** = stored on the task row in the database (the existing `task_date` column already encodes this — today's date = Today, tomorrow = Tomorrow, later this week = This Week).
- **Topic group** = derived on the fly by the AI from the task text, independent of date.

So when you drag a task from Today → Tomorrow, we just update its `task_date`. The topic groups are recomputed across **all visible pending tasks**, then rendered nested inside each time bucket. Dragging never destroys grouping — it just moves the task to a different bucket, and its topic header re-appears there.

Visual layout in the middle column:

```text
Tasks
├── Today
│   ├── Databricks Integration
│   │   • task A
│   │   • task B
│   └── Jira Sync
│       • task C
├── Tomorrow
│   └── ACL Coordination
│       • task D
└── This Week
    └── Hubspot Dataset
        • task E
```

Drop targets are the **bucket headers** (Today / Tomorrow / This Week). You don't drop into a topic group — the topic group it lands in is decided automatically by the AI grouping pass.

## What changes

### 1. Provider (`TasksForTodayProvider.tsx`)
- Widen the pending fetch to also include tasks dated tomorrow and the rest of the current week (not just `<= todayKey`).
- Split `pending` into three derived buckets by `task_date`: `today`, `tomorrow`, `thisWeek` (rest of current workweek, excluding today/tomorrow).
- Run AI grouping **once** over the full pending pool, then split each returned group's rows by bucket when rendering. That keeps topic titles consistent across buckets and avoids three separate AI calls.
- Add `moveTaskToBucket(row, bucket)` — optimistic update of `task_date`, then `update` in Supabase, with rollback on error.

### 2. UI (`TasksForToday.tsx`)
- Render three labeled bucket sections inside "Tasks for Today" (rename card to just "Tasks"). Each bucket lists its topic groups → tasks.
- Make each task row draggable (HTML5 drag-and-drop, no new dependency).
- Make each bucket header a drop zone with hover highlight.
- Keep existing checkbox / X / "saved" affordances unchanged.

### 3. Context type (`TasksForTodayContext.ts`)
- Replace `pending` / `pendingGroups` with `pendingByBucket: { today, tomorrow, thisWeek }` where each bucket is `TaskGroup[]`.
- Add `moveTaskToBucket` to the context value.

### 4. Completed Yesterday / Completed Today
- Unchanged.

## Edge cases handled

- **Overdue tasks** (dated before today, still pending): roll into the **Today** bucket automatically, same as today's behavior.
- **Past today's week**: when you navigate to a future week, "This Week" is computed relative to `selectedDate`'s week.
- **Drag within same bucket**: no-op.
- **Failed save**: optimistic move reverts and shows a toast.
- **AI grouping latency**: while grouping is in flight, tasks render flat under their bucket (no topic headers yet), then re-render grouped — same UX pattern you have today.

## Open question

Should **This Week** include only the remaining workdays of the current week (Wed–Fri if today is Tue), or also spill into next week if you've dragged something further out? The simplest first pass: only the current workweek. We can extend to a "Later" bucket later if useful.

## Out of scope

- Reordering tasks within a group (drag handle for sort order).
- Dragging directly onto a specific topic group to force a category.
- Mobile touch drag (HTML5 DnD works on desktop; we can add `@dnd-kit` later if you want touch support).