# Optional multi-column backlog view

## Goal
Add a view toggle that switches the Backlog between its current vertical list and a full-width multi-column board. The board should show several groups together, reduce page scrolling, and preserve the task interactions already available.

## What will change
- Add a compact List/Board toggle beside the Backlog heading, with labels available as tooltips and for screen readers.
- Keep the existing vertical backlog as the default option.
- In Board view, expand the Backlog across the dashboard width so each backlog group becomes its own column.
- Lay out as many group columns as fit the screen; allow horizontal scrolling only when there are more groups than can fit comfortably.
- Give each group column a stable width and its own bounded vertical task area so a long group does not force every other group far down the page.
- Preserve group titles, task counts, name pills, importance styling, age pills, completion, editing, deletion, and right-click actions in both views.
- Preserve drag-and-drop between groups and the existing ability to drag tasks into Today, Tomorrow/Monday, or This Week/Next Week.
- Keep the existing Backlog open/close control working in either layout.
- Remember the selected List or Board preference on that device.
- On narrow screens, fall back to the existing readable vertical layout rather than squeezing several columns together.

## Dashboard behavior
In Board view, the Backlog becomes a full-width row above the current dashboard columns. Today, the entry area, weekly report, and completed-task areas retain their existing arrangement below it. Switching back to List restores the Backlog to its current location inside Tasks.

## Technical details
- Lift the backlog layout preference to the dashboard so it can reposition only the Backlog without duplicating its data or behavior.
- Separate backlog rendering from the other task buckets while continuing to use the same task context and movement methods.
- Reuse the current task and group renderers so both layouts remain behaviorally identical.
- Use the existing semantic colors and control components; no backend or AI changes are needed.
- Add focused UI tests for switching layouts, preference persistence, and preserving group drop targets.

## Verification
- Check List and Board modes with a large backlog and groups of uneven size.
- Confirm moving tasks between board columns persists after refresh.
- Confirm moving a task between Backlog and the date buckets still works.
- Check desktop and narrow-screen layouts for clipping, overlap, and unnecessary page scrolling.
