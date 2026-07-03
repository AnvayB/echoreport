export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  template: string;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "default",
    name: "Standard",
    description: "Classic weekly status update grouped by category.",
    template: `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is my weekly status update:

## Highlights
[Key accomplishments this week]

## Challenges / Blockers
[Any issues encountered]

## Completed Tasks
[Detailed list of completed work]

## Carry-over / Next Week
[Tasks remaining for next week]

Best regards`,
  },
  {
    id: "default-grouped",
    name: "Standard — Grouped by Backlog Projects",
    description: "Classic weekly status update where completed tasks and carry-over are organized by the project groups from your backlog.",
    template: `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is my weekly status update:

## Highlights
[Key accomplishments this week]

## Challenges / Blockers
[Any issues encountered]

## Completed Tasks
[Detailed list of completed work — grouped by project/theme from the backlog]

## Carry-over / Next Week
[Tasks remaining for next week — grouped by the same project/theme headings]

Best regards`,
  },
  {
    id: "by-customer",
    name: "Group by Customer",
    description: "Organize completed work, next-week plans, and blockers per customer.",
    template: `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is my weekly status update, organized by customer.

## Per-Customer Breakdown
For each customer mentioned in my tasks or notes, create a section like this. Only create a customer section if at least one task or note explicitly mentions them.

### [Customer Name]
**Completed this week:**
- [Tasks completed for this customer]

**Planned for next week:**
- [Pending/carryover tasks for this customer]

**Blockers:**
- [Any blockers tied to this customer, or "None"]

Repeat the section above for every distinct customer.

## Internal / Non-Customer Work
**Completed:**
- [Tasks not tied to a specific customer]

**Planned for next week:**
- [Carryover tasks not tied to a specific customer]

## Cross-Cutting Blockers
[Blockers not specific to one customer, or "None"]

Best regards`,
  },
  {
    id: "by-project",
    name: "Group by Project",
    description: "Sectioned by project or workstream instead of customer.",
    template: `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is my weekly status update, organized by project.

## Per-Project Breakdown
For each project or workstream mentioned in my tasks or notes, create a section like this. Only create a project section if at least one task or note explicitly mentions it.

### [Project Name]
**Completed this week:**
- [Tasks completed on this project]

**Planned for next week:**
- [Pending/carryover tasks for this project]

**Blockers / Risks:**
- [Any blockers tied to this project, or "None"]

Repeat for every distinct project.

## Other Work
[Tasks not tied to a specific project]

## Cross-Cutting Blockers
[Blockers not specific to one project, or "None"]

Best regards`,
  },
  {
    id: "chronological",
    name: "Chronological",
    description: "Day-by-day recap of the week, then a forward-looking section.",
    template: `Subject: Weekly Status Update - [Week Range]

Hi team,

Here is a day-by-day recap of my week.

## This Week
### Monday
- [What was completed Monday]

### Tuesday
- [What was completed Tuesday]

### Wednesday
- [What was completed Wednesday]

### Thursday
- [What was completed Thursday]

### Friday
- [What was completed Friday]

## Blockers
[Any open blockers from the week]

## Next Week
[Carryover tasks and planned work]

Best regards`,
  },
  {
    id: "concise",
    name: "Concise Bullets",
    description: "Minimal, scannable bullet-point summary for busy stakeholders.",
    template: `Subject: Weekly Update - [Week Range]

Hi team,

**Done this week**
- [Bulleted list of completed tasks, grouped tightly]

**Next week**
- [Bulleted list of carryover and planned work]

**Blockers**
- [Bulleted list of blockers, or "None"]

Thanks`,
  },
];
