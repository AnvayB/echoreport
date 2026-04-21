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
  task_date: string;
  section: string;
  task_text: string;
  completed: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entries, tasks, emailTemplate, weekLabel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const entriesSummary = (entries || [])
      .map((e: DailyEntry) =>
        `## ${e.entry_date}\nAccomplishments: ${e.accomplishments || "None"}\nPending: ${e.pending_tasks || "None"}\nBlockers: ${e.blockers || "None"}\nNotes: ${e.notes || "None"}`
      )
      .join("\n\n");

    // Group tasks by completion / carryover (based on AUTHORITATIVE checkbox state)
    const taskList: DailyTask[] = Array.isArray(tasks) ? tasks : [];
    const completedTasks = taskList.filter((t) => t.completed);
    const pendingTasks = taskList.filter((t) => !t.completed && (t.section === "pending" || t.section === "pending:manual"));
    const blockerTasks = taskList.filter((t) => !t.completed && t.section === "blocker");

    const fmtTaskList = (rows: DailyTask[]) =>
      rows.length === 0
        ? "  (none)"
        : rows.map((r) => `  - [${r.task_date}] ${r.task_text}`).join("\n");

    const taskSummary = `\n\n## Authoritative checkbox state for the week\n` +
      `### Completed (checked off)\n${fmtTaskList(completedTasks)}\n\n` +
      `### Still Pending (carries into next week)\n${fmtTaskList(pendingTasks)}\n\n` +
      `### Open Blockers\n${fmtTaskList(blockerTasks)}\n`;

    const templateInstruction = emailTemplate
      ? `Follow this email format/template as closely as possible:\n\n${emailTemplate}`
      : "Write a professional weekly status update email.";

    const systemPrompt = `You are a professional assistant that writes weekly status update emails. ${templateInstruction}

Replace any placeholders with actual content. Use the AUTHORITATIVE checkbox state as the source of truth for what is completed vs. carryover — it represents the user's actual progress. The daily entry text supplies highlights, lowlights, narrative context, and notes.

Rules:
- "Completed Tasks" / accomplishments must come from the checked-off task list (and may be enriched with narrative from the entries).
- "Carry-over" / "Next Week" must come from the still-pending task list. Do NOT include items the user already checked off.
- Open blockers go under blockers/challenges.
- Output the full email as plain text ready to copy-paste. No markdown code fences.`;

    const userPrompt = `Generate my weekly status update email for the week of ${weekLabel}.

Here are my daily entries:\n\n${entriesSummary || "No entries recorded this week."}${taskSummary}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
