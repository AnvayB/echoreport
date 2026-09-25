# Weekly Report Formatting and Outlook Fix

## Changes
- Enforce bold section headings for Completed Tasks, Highlights, Lowlights, and Carry-over / Next Week.
- Render each `Group: …` label as underlined text only, without bold styling.
- Remove bracketed task dates from completed and carry-over task bullets before the report is generated.
- Open the Outlook compose window immediately from the button click, then populate its subject after preparing the clipboard so browsers do not block it.
- Keep the existing rich clipboard workflow so pasting into Outlook preserves headings, underlines, and bullets.

## Technical details
- Update the weekly-report AI instructions and task summaries to emit the requested markdown/HTML conventions and date-free bullets.
- Update the email HTML conversion to recognize the section and group labels deterministically.
- Add a safe Outlook fallback if the new tab cannot be opened.
- Verify the generated app compiles and the Outlook interaction opens a compose tab.
