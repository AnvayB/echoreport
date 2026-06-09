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
    const todayDate: string | undefined = body?.today_date; // YYYY-MM-DD from client (user's locale)
    const defaultWhen: string | undefined = body?.default_when; // "today" | "tomorrow" | "this_week" | YYYY-MM-DD
    const sectionHint: string | undefined = body?.section; // "completed" | "pending" | "blocker"

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const dateContext = todayDate
      ? `Today's date is ${todayDate} (YYYY-MM-DD).`
      : "";

    const sectionContext = sectionHint === "pending"
      ? `These items come from the user's "Pending / Tomorrow" section of an end-of-day journal — things they did NOT finish today and want to carry forward. Even if phrased in past tense or as observations, treat them as future action items. Treat them as TOMORROW by default unless the user explicitly names a different time.`
      : sectionHint === "completed"
        ? `These items come from the user's "Accomplishments" section — things already done today. Extract each distinct completed item.`
        : sectionHint === "blocker"
          ? `These items come from the user's "Blockers" section — challenges or stuck items that need follow-up.`
          : "";

    const defaultWhenLine = defaultWhen
      ? `If the user gives no time hint at all, default "when" to "${defaultWhen}".`
      : `If the user gives no time hint at all, default "when" to "today".`;

    const systemPrompt = `You are a productivity assistant. Convert free-form text describing tasks into a clean array of concise, professional task items, each tagged with WHEN it should happen.

${dateContext}

${sectionContext}

You MUST respond by calling the parse_tasks tool. Rules:
- Each item is a single, concise, action-oriented task line starting with an imperative verb (no emojis, no bullet markers like "-" or "*", no numbering, no leading dashes).
- Strip filler like "need to", "have to", "got to", "should", "want to", "going to", "I'll", "I need to". Capitalize the first letter. Fix obvious typos (e.g., "too" used where "to" is meant). Preserve specifics (names, tools, context). Example: "- need to explore Smartsheet too understand AE Assignments" → "Explore Smartsheet to understand AE Assignments".
- Split distinct tasks into separate items. Merge duplicate or trivially similar ones.
- Preserve the user's intent and important specifics, but trim filler words.
- For each task, set "when":
  - "tomorrow" if the user says tomorrow, next day, in the morning (when written at end of day), etc.
  - "this_week" if the user says this week, later this week, by Friday, by end of week.
  - A specific "YYYY-MM-DD" if the user names a weekday or date you can resolve (use today's date above as anchor; pick the next occurrence of that weekday).
  - "today" if the user explicitly says today, ASAP, this morning/afternoon.
  - ${defaultWhenLine}
- Do NOT invent dates beyond what the text says.
- IMPORTANCE MARKER: If the user marks a task with the word "IMPORTANT" (any case), prefix that task's "text" with "!! " (two exclamation marks and a space) and remove the literal word "IMPORTANT" from the text. Do not add this prefix unless the user explicitly marked it important.
- If no actionable tasks are found, return { "items": [] }.`;

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
              name: "parse_tasks",
              description: "Return parsed tasks with when-hints.",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        when: {
                          type: ["string", "null"],
                          description: "today | tomorrow | this_week | YYYY-MM-DD | null",
                        },
                      },
                      required: ["text", "when"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_tasks" } },
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
    let items: Array<{ text: string; when: string | null }> = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(parsed.items)) {
          items = parsed.items
            .filter((i: any) => i && typeof i.text === "string" && i.text.trim().length > 0)
            .map((i: any) => ({
              text: i.text.trim(),
              when: typeof i.when === "string" ? i.when : null,
            }));
        }
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-parse-tasks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
