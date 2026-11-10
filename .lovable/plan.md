# Completed Work Analytics page

A new page, reachable from a chart icon in the top header (next to Settings), available to every user. It shows only that user's own completed tasks.

## What you'll see

- **Date range filter:** 1 week, 30 days, This month, All time.
- **KPI cards:** total tasks completed, average per workday, most active group, current streak (days in a row with at least one completed task), important tasks completed.
- **Line chart:** completions over time, one line per group (daily buckets for short ranges, weekly for long ones). The top groups get their own lines; the rest roll into "Other". Click a legend item to hide or show a line.
- **Group breakdown:** a horizontal bar chart of completed tasks by group, plus a share-of-work donut.
- **Group list:** each group with its count; expand it to see the tasks it contains.

## How groups are decided

- **Locked groups:** your current backlog groups (the ones existing now, including empty groups you made) are treated as fixed. Tasks completed from Oct 15 onward keep the group they already have.
- **Older or ungrouped tasks:** completed tasks before Oct 15, or with no group, get a best-guess group from AI. The AI prefers your current groups and only invents a new group name when nothing fits.
- **One-time and saved:** the guess is stored with each task, so it runs once and the page loads fast afterward. A "Reclassify older tasks" button reruns it if you add new groups later.
- AI-assigned groups are kept separate from your real task groups, so nothing in your backlog or weekly report changes.

## Technical details

- New route `/analytics` (`src/pages/AnalyticsPage.tsx`), `BarChart3` icon in `Dashboard.tsx` header; uses existing `recharts` + `components/ui/chart.tsx`.
- Add nullable `daily_tasks.analytics_group` column (existing RLS covers it). Effective group = `group_title` if task date >= 2026-10-15 and set, else `analytics_group`, else "Uncategorized".
- New edge function `ai-classify-completed` (same OpenAI key/model as other functions): receives batches of uncategorized completed tasks plus the locked group list, returns task id -> group; client writes `analytics_group`.
- Aggregation (range filtering, bucketing, KPIs, effective group, top-N + Other) in a pure `src/lib/analytics.ts` with unit tests for the cutoff rule, range boundaries, and streak calculation.
- Tasks with the `!! ` prefix count as important.
