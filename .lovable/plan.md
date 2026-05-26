## Goal
Make the age pill next to each task escalate in color/intensity across more time ranges, so older tasks visually stand out more.

## Current behavior (in `TasksForToday.tsx`)
- `< 3 days` → subtle muted pill
- `3–6 days` → slightly stronger muted pill
- `≥ 7 days` → destructive (red) pill, same look for 1w, 3w, 1mo+

So everything from 1 week onward looks identical.

## New tiering
Keep `today` and `<3d` as-is. Escalate from 1 week onward:

| Age | Tone | Intent |
|---|---|---|
| today / 1d–2d | muted/50 + muted-foreground | quiet |
| 3d–6d | muted + foreground | noticeable |
| 1w (7–13d) | amber/yellow tint + border | warning |
| 2w–3w (14–27d) | orange tint + border | strong warning |
| 1mo+ (≥28d) | destructive (red) bg+border | critical |

## Implementation
In the `tone` ternary inside `renderCheckboxRow` (around line 99 of `TasksForToday.tsx`), replace the 3-branch logic with a 5-branch ladder based on `days`:

```ts
const tone =
  days >= 28 ? "bg-destructive/10 text-destructive border-destructive/30"
  : days >= 14 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
  : days >= 7  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
  : days >= 3  ? "bg-muted text-foreground border-border"
  : "bg-muted/50 text-muted-foreground border-border";
```

Note on tokens: the project's design system doesn't define semantic "warning" tokens (only `destructive`, `muted`, etc.). Two options:
- **A (quick):** use Tailwind's built-in `amber-*` / `orange-*` palette inline as above. Pragmatic, no design-system changes.
- **B (clean):** add `--warning` and `--warning-strong` HSL tokens to `index.css` + `tailwind.config.ts`, then use `bg-warning/10 text-warning border-warning/30`. More work but stays inside the design system.

Recommend **A** for a small visual tweak; switch to **B** if you'd like a reusable warning token across the app.

## Files touched
- `src/components/TasksForToday.tsx` (only the `tone` expression)
- (option B only) `src/index.css`, `tailwind.config.ts`