# Roadmap

- [x] Soften dark-mode text, outlines, buttons, and status accents while keeping light mode unchanged.
- [x] Verify dimmed dark mode on signed-in desktop/mobile task views; text contrast exceeds 4.5:1, control contrast exceeds 3:1, and 12 relevant tests pass.

- [x] Add date-filtered average creation-to-completion days by analytics group, with measured-task counts and unit tests.
- [ ] Verify average completion times on signed-in analytics with real tasks — blocked because session minting could not match the requesting account; 8 analytics tests pass and preview build is clean.

- [x] Add persistent charcoal dark mode and adapt accent colors across pages and expanded backlog.
- [x] Verify light/dark switching and persistence on desktop and mobile (23 tests pass; browser verified sign-in screen, reload persistence, and mobile layout).
- [x] Verify signed-in dashboard and expanded backlog visually with tasks added through a temporary test account.

- [x] Add expanded-board-only empty-space drop to create a task-backed group, with persistent renaming.
- [x] Verify empty-space drops and existing group drops remain distinct (10 tests pass; signed-in visual check unavailable because session minting could not match the requesting account).

- [x] Add an optional full-screen, multi-column Backlog board based on the supplied wireframe.
- [x] Preserve task editing, completion, deletion, scheduling, and drag-and-drop in the expanded view.
- [x] Verify compilation and layout constraints for desktop and narrow screens.- [x] Analytics page; keyword hints (CSP, Tickets Timeline, Project Hub, SQE) for older tasks
