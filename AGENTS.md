# Project architecture rules

- Keep alternate task layouts as views over `TasksForTodayContext`, so task data and mutations have one source of truth.
- Empty-space board drops create task-backed groups through the shared task-movement operation; mark existing drop targets explicitly so background drops cannot intercept them.
- Backlog groups come from two sources: task-backed groups (via `daily_tasks.group_title`) and manually created empty groups persisted in `backlog_groups` (merged by `src/lib/backlogGroups.ts`). Never derive a group list from only one source; drop a `backlog_groups` row when its title becomes task-backed.