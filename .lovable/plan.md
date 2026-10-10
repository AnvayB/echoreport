# Optional multi-column backlog view

## Goal
Add a view option that opens the Backlog as a full-size multi-column board over the current page. The board should use the empty screen width shown in the reference, display several groups together, reduce page scrolling, and preserve the task interactions already available without restructuring the dashboard.

## What will change
- Add an icon button beside the Backlog heading to open the expanded board; the current vertical backlog remains the default dashboard view.
- Open the board in a full-size overlay with a clear close control, leaving the underlying dashboard structure unchanged.
- Arrange backlog groups as independent panels in a responsive masonry-like grid, matching the wireframe: several groups across, with each panel sized by its task content rather than forced to equal height.
- Use the available screen width and place additional groups into further grid positions; keep scrolling inside the overlay when the complete board exceeds one screen.
- Give very long groups a bounded task area with internal scrolling so one group does not dominate the board.
- Preserve group titles, task counts, name pills, importance styling, age pills, completion, editing, deletion, and right-click actions in both views.
- Preserve drag-and-drop between groups and the existing ability to drag tasks into Today, Tomorrow/Monday, or This Week/Next Week.
- Keep the existing Backlog open/close control on the dashboard.
- On narrow screens, the expanded board becomes a single-column full-screen view rather than squeezing several panels together.

## Dashboard behavior
The existing dashboard does not move. Opening the expanded Backlog places the multi-group board over it; closing the board returns to the exact previous dashboard state and scroll position.

## Technical details
- Render the expanded board from the existing task context in a full-screen dialog/overlay, without duplicating task data or movement logic.
- Separate reusable backlog group and task rendering from the bucket wrapper so the dashboard list and expanded board remain behaviorally identical.
- Reuse the current task and group renderers so both layouts remain behaviorally identical.
- Use the existing semantic colors and control components; no backend or AI changes are needed.
- Add focused UI tests for opening/closing the board and preserving group drop targets.

## Verification
- Check the dashboard list and expanded board with a large backlog and groups of uneven size.
- Confirm moving tasks between board columns persists after refresh.
- Confirm moving a task between Backlog and the date buckets still works.
- Confirm closing the board restores the dashboard without layout or scroll changes.
- Check desktop and narrow-screen layouts for clipping, overlap, and unnecessary page scrolling.
