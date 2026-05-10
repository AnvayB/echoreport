## Goal

Detect when the task list contains **duplicate or near-duplicate tasks** (including semantic duplicates worded differently), flag them in the UI, and let the user choose to **delete one** or **keep both**.

## Why the current logic misses them

`mergeDuplicateTaskRows` (in `src/lib/taskUtils.ts`) only matches tasks that share many literal tokens. Real-world duplicates in the list use different wording, e.g.:

- "Enhance Project Hub user interface" ↔ "improve Project Hub UI"
- "Add Customer Projects to the CSP main page" ↔ "Display Customer Projects on CSP homepage"

Token-overlap rules can't catch these. Detection needs to be **semantic** (AI-powered).

## Approach

### 1. New edge function: `ai-detect-duplicate-tasks`

- Input: `{ tasks: [{ id, task_text }] }` (the current pending + blockers, scoped per user).
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a tool-call schema returning:
  ```json
  { "clusters": [ { "task_ids": ["...","..."], "reason": "short why" } ] }
  ```
- System prompt: "Group tasks that describe the same intended work, even if worded differently. Only return clusters of 2+. Skip tasks that are merely related but distinct."
- Validates: every id exists in input, no id appears in two clusters, clusters have ≥2 ids.

### 2. Provider wiring (`TasksForTodayProvider.tsx`)

- After `pending`/`blockers` load, debounce-call the new function (similar pattern to existing `ai-group-tasks` effect, keyed on `pendingIdsKey`).
- Store results as `duplicateClusters: Array<{ key, reason, rows: TaskRow[] }>` in state.
- Track `dismissedClusterKeys: Set<string>` in component state for "Keep both" decisions (session-only — re-flagging next reload is acceptable; we can persist later if needed).
- Add to context:
  - `duplicateClusters`
  - `dismissDuplicateCluster(key)` → adds key to dismissed set
  - `resolveDuplicateCluster(key, keepId)` → deletes the other rows in that cluster from `daily_tasks` and updates local `pending`/`blockers` state (with optimistic update + rollback on error, mirroring `deleteTask`).

### 3. UI (`src/components/TasksForToday.tsx`)

Add a `DuplicatesAlert` block at the top of the default `pending` section (only when `duplicateClusters.length > 0`):

- Card styled with `border-warning` / `bg-muted/50` and an `AlertTriangle` icon — uses semantic tokens.
- One row per cluster:
  - Header: "Possible duplicate" + small reason text.
  - List of the duplicate task texts, each with a **Keep this one** button (calls `resolveDuplicateCluster(key, row.id)`).
  - A **Keep both** button on the cluster (calls `dismissDuplicateCluster(key)`).

### 4. Out of scope

- No DB schema changes.
- Don't touch the existing `mergeDuplicateTaskRows` literal-dedupe — it still safely catches exact dupes silently and shouldn't conflict (semantic clusters will only surface remaining near-duplicates).
- No persistence of "Keep both" decisions across reloads (can be added later if it becomes annoying).

## Files touched

- `supabase/functions/ai-detect-duplicate-tasks/index.ts` (new)
- `src/components/TasksForTodayContext.ts` (extend context type)
- `src/components/TasksForTodayProvider.tsx` (detect, resolve, dismiss)
- `src/components/TasksForToday.tsx` (render duplicate alerts)
