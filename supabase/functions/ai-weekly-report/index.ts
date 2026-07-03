import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DailyEntry {
  entry_date: string;
  accomplishments?: string;
  pending_tasks?: string;
  blockers?: string;
  notes?: string;
}

interface DailyTask {
  id?: string;
  task_date: string;
  section: string;
  task_text: string;
  completed: boolean;
}

interface TaskGroup {
  title: string;
  task_ids: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entries, tasks, thisWeekPending, nextWeekPending, backlogPending, taskGroups, emailTemplate, weekLabel } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const entriesSummary = (entries || [])
      .map((e: DailyEntry) =>
        `## ${e.entry_date}\nAccomplishments: ${e.accomplishments || "None"}\nPending: ${e.pending_tasks || "None"}\nBlockers: ${e.blockers || "None"}\nNotes: ${e.notes || "None"}`
      )
      .join("\n\n");

    // Group tasks by completion / carryover (based on AUTHORITATIVE checkbox state)
    const taskList: DailyTask[] = Array.isArray(tasks) ? tasks : [];
    const completedTasks = taskList.filter((t) => t.completed);
    const blockerTasks = taskList.filter((t) => !t.completed && t.section === "blocker");

    // Build id -> group title map from the shared backlog groupings
    const groupTitleById = new Map<string, string>();
    const groupList: TaskGroup[] = Array.isArray(taskGroups) ? taskGroups : [];
    for (const g of groupList) {
      for (const id of g.task_ids || []) groupTitleById.set(id, g.title);
    }
    const groupOrder = groupList.map((g) => g.title);

    const fmtTaskList = (rows: DailyTask[]) =>
      rows.length === 0
        ? "  (none)"
        : rows.map((r) => `  - [${r.task_date}] ${r.task_text}`).join("\n");

    const fmtGrouped = (rows: DailyTask[]) => {
      if (rows.length === 0) return "  (none)";
      if (groupTitleById.size === 0) return fmtTaskList(rows);
      const buckets = new Map<string, DailyTask[]>();
      for (const r of rows) {
        const title = (r.id && groupTitleById.get(r.id)) || "Other";
        if (!buckets.has(title)) buckets.set(title, []);
        buckets.get(title)!.push(r);
      }
      const titles = [
        ...groupOrder.filter((t) => buckets.has(t)),
        ...[...buckets.keys()].filter((t) => !groupOrder.includes(t)),
      ];
      return titles
        .map(
          (title) =>
            `  [Group: ${title}]\n` +
            buckets.get(title)!.map((r) => `    - [${r.task_date}] ${r.task_text}`).join("\n")
        )
        .join("\n");
    };

    // Use tiered pending data if provided (new clients), otherwise fall back to flat list
    const slippedThisWeek: DailyTask[] = Array.isArray(thisWeekPending)
      ? (thisWeekPending as DailyTask[]).filter((t) => t.section !== "blocker")
      : taskList.filter((t) => !t.completed && (t.section === "pending" || t.section === "pending:manual"));
    const plannedNextWeek: DailyTask[] = Array.isArray(nextWeekPending)
      ? (nextWeekPending as DailyTask[]).filter((t) => t.section !== "blocker")
      : [];
    const olderBacklog: DailyTask[] = Array.isArray(backlogPending)
      ? (backlogPending as DailyTask[]).filter((t) => t.section !== "blocker")
      : [];

    const taskSummary = `\n\n## Authoritative task state for the week\n` +
      `### Completed (checked off this week) — pre-grouped by project/theme\n${fmtGrouped(completedTasks)}\n\n` +
      `### Slipped this week (scheduled for this week, not completed) — pre-grouped\n${fmtGrouped(slippedThisWeek)}\n\n` +
      `### Explicitly planned for next week — pre-grouped\n${fmtGrouped(plannedNextWeek)}\n\n` +
      `### Older backlog (select only if directly relevant) — pre-grouped\n${fmtGrouped(olderBacklog)}\n\n` +
      `### Open Blockers\n${fmtTaskList(blockerTasks)}\n`;

    const templateInstruction = emailTemplate
      ? `Follow this email format/template as closely as possible:\n\n${emailTemplate}`
      : "Write a professional weekly status update email.";

    const groupingRule = groupTitleById.size > 0
      ? `- Inside the "Completed Tasks" and "Carry-over / Next Week" sections, organize tasks under the "[Group: ...]" project/theme headings supplied in the authoritative task state. Render each group as a "**Group Title**" subheading followed by that group's bullets. Preserve the group titles verbatim. Do not invent new groups or merge groups. Keep the overall email structure from the template (highlights, lowlights/challenges, completed, carry-over, blockers) — the groupings only apply WITHIN the completed and carry-over sections.`
      : `- Present completed tasks and carry-over as flat bullet lists.`;

    const systemPrompt = `You are a professional assistant that writes weekly status update emails. ${templateInstruction}

Replace any placeholders with actual content. Use the AUTHORITATIVE task state as the source of truth for what is completed vs. carry-over. The daily entry text supplies narrative, highlights, and context.

Rules:
- "Completed Tasks" / accomplishments must come only from the checked-off task list (enrich with entry narrative where helpful).
${groupingRule}
- "Carry-over / Next Week" selection rules — be SELECTIVE, not exhaustive:
  1. Always include tasks from "Slipped this week" — these are things you intended to do but didn't finish.
  2. Always include tasks from "Explicitly planned for next week" — these are intentional.
  3. From "Older backlog": include ONLY items that are clearly related to this week's completed work or themes. Skip generic long-running items that have no connection to the current week.
  4. Do NOT just dump the entire backlog. A realistic carry-over list has 3–8 focused items.
- Open blockers go under the blockers/challenges section.
- Output the full email as plain text ready to copy-paste. No markdown code fences.`;

    const userPrompt = `Generate my weekly status update email for the week of ${weekLabel}.

Here are my daily entries:\n\n${entriesSummary || "No entries recorded this week."}${taskSummary}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const report = data.choices?.[0]?.message?.content || "Unable to generate report.";

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-weekly-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
