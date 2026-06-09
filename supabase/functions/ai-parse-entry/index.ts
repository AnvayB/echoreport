import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const text: string = body?.text;
    const todayDate: string | undefined = body?.today_date; // YYYY-MM-DD

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const dateContext = todayDate
      ? `The entry is for ${todayDate} (YYYY-MM-DD). Use this as the anchor when the user mentions weekdays or relative dates.`
      : "";

    const systemPrompt = `You are a productivity assistant. The user will give you a free-form brain dump of their workday. Parse it into structured fields and return via the parse_entry tool.

${dateContext}

FIELD DEFINITIONS — read carefully:
- "accomplishments": Things ALREADY DONE or completed today (past tense). Bullet list (lines starting with "- "). Keep the user's wording as-is.
- "pending_tasks": Things NOT YET DONE — planned for tomorrow or later, still in progress, or left over. Bullet list (lines starting with "- "). Rewrite as imperative action items (see rules below).
- "blockers": Challenges, issues, or things blocking progress — regardless of tense. Bullet list. Keep user's wording.
- "notes": Anything else — follow-ups, random thoughts, reminders, FYIs. Bullet list.
- "pending_task_schedule": One entry per pending task with WHEN it should happen. The "text" field must closely match the corresponding bullet in "pending_tasks".

CRITICAL: Do NOT put the same item in both accomplishments and pending_tasks. If a task is done → accomplishments. If not done → pending_tasks.

For each pending task's "when":
- "tomorrow" if they say tomorrow, next day, or morning (this is end-of-day, so "tomorrow" is the most common).
- "this_week" if they say this week, by Friday, by end of week.
- A specific "YYYY-MM-DD" if they name a weekday or date resolvable from the anchor date.
- "today" if they say today, ASAP, or now.
- null if genuinely unclear.

Rules:
- Use bullet points (lines starting with "- ") within the four text fields.
- If a category has nothing, return an empty string "" (or empty array for pending_task_schedule).
- For "accomplishments", "blockers", and "notes": keep the user's wording as much as possible.
- ACTION-ITEM REWRITE for pending tasks only: Rewrite each pending item as a concise, imperative action starting with a verb. Strip filler like "need to", "have to", "got to", "should", "want to", "going to", "I'll", "I need to". Capitalize the first letter. Fix obvious typos. Preserve all specifics (names, tools, context). Example: "need to explore Smartsheet too understand AE Assignments" → "Explore Smartsheet to understand AE Assignments".
- IMPORTANCE MARKER: If a task is marked with the word "IMPORTANT" (any case) by the user, prefix that task's text with "!! " (two exclamation marks and a space) in BOTH "pending_tasks" bullets and "pending_task_schedule" entries, and remove the literal word "IMPORTANT" from the text. Do not add this prefix unless the user explicitly marked the task important.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_entry",
              description: "Parse a free-form work update into structured categories with per-task scheduling hints.",
              parameters: {
                type: "object",
                properties: {
                  accomplishments: { type: "string", description: "What was completed today" },
                  pending_tasks: { type: "string", description: "What's left or planned for tomorrow" },
                  blockers: { type: "string", description: "Challenges or blockers" },
                  notes: { type: "string", description: "Other notes or follow-ups" },
                  pending_task_schedule: {
                    type: "array",
                    description: "One entry per pending task with a when-hint.",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        when: { type: ["string", "null"], description: "today | tomorrow | this_week | YYYY-MM-DD | null" },
                      },
                      required: ["text", "when"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["accomplishments", "pending_tasks", "blockers", "notes", "pending_task_schedule"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_entry" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      // Ensure schedule field exists for older callers / safety.
      if (!Array.isArray(parsed.pending_task_schedule)) parsed.pending_task_schedule = [];
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback
    const content = data.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.pending_task_schedule)) parsed.pending_task_schedule = [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-parse-entry error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
