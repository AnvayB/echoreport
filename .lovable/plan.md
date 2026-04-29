## Goal

When a task mentions a person (e.g. "Email Sarah about Q3 plan", "Sync with Marcus"), wrap their name in a small pill outline so communication-with-people tasks visually stand out.

## Approach

Use a lightweight client-side renderer — no AI round-trip, no DB changes. Detect proper-noun name candidates with a regex + filter, then render the task text as a mix of plain `<span>`s and pill `<span>`s.

## What gets a pill

A token is treated as a name if it:
- Starts with a capital letter followed by lowercase letters (e.g. `Sarah`, `Marcus`, `O'Neil`, `María`)
- Optionally extends to a second capitalized word for first+last (e.g. `Sarah Chen`)
- Is **not** in a stop-list of common capitalized non-names (weekdays, months, products, generic words that often start sentences, and acronyms like `EOD`, `Q3`, `AI`, `PR`, `API`, `CEO`, etc.)
- Is **not** the first word of the task (sentence-initial capitalization is ambiguous — e.g. "Email Sarah" → "Email" skipped, "Sarah" pilled). Exception: if a clear communication verb precedes it (`email`, `call`, `message`, `text`, `dm`, `slack`, `ping`, `sync with`, `meet`, `follow up with`, `ask`, `tell`, `remind`, `update`), we trust the cap.

Multi-word names: greedily merge two adjacent capitalized tokens into one pill when both pass filters.

## Files

**New:** `src/lib/nameHighlight.ts`
- `tokenizeWithNames(text: string): Array<{ type: "text" | "name"; value: string }>`
- Exports the stop-list and communication-verb list as constants for easy tuning.

**New:** `src/components/TaskText.tsx`
- Tiny component that takes `text` and renders the tokens, wrapping name tokens in:
  ```tsx
  <span className="inline-flex items-center rounded-full border border-primary/60 px-1.5 py-0 text-[0.78em] font-medium text-primary bg-primary/5 mx-0.5 leading-snug">
    {value}
  </span>
  ```
  Uses `text-[0.78em]` so the pill scales relative to surrounding text and doesn't break line-height.

**Edit:** `src/components/TasksForToday.tsx`
- Replace the three places task text is rendered (`renderCheckboxRow` pending row, completed-yesterday row, completed-today row) — swap `{row.task_text}` for `<TaskText text={row.task_text} />`.
- Keep the `line-through text-muted-foreground` styling on the wrapping `<span>`; pills inherit muted color via `currentColor`-friendly classes when completed (we'll add a `muted` prop to `TaskText` and dim the pill border/text for completed rows).

**Edit:** `src/lib/nameHighlight.test.ts` (new, optional but nice)
- A few unit tests covering: "Email Sarah" → pill on Sarah only; "Sync with John Smith" → one pill on "John Smith"; "Update Q3 roadmap" → no pills; "Monday standup" → no pills; "Ask Maria and Tom" → two pills.

## Visual

```text
Before:  ☐ ⋮ Email Sarah about the Q3 roadmap                      ✕
After:   ☐ ⋮ Email (Sarah) about the Q3 roadmap                    ✕
                    └ rounded pill, primary outline
```

## Out of scope

- No AI-based entity recognition (keeps it instant + free).
- No persistence of who-is-mentioned. If you later want filtering ("show all tasks involving Sarah"), we can add a derived index then.
- No avatar/colored-by-person — pills are uniform primary outline.
