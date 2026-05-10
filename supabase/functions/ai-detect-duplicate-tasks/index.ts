import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tasks } = await req.json();
    if (!Array.isArray(tasks) || tasks.length < 2) {
      return new Response(JSON.stringify({ clusters: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const validIds = new Set<string>(
      tasks.map((t: { id: string }) => t.id).filter((id: unknown) => typeof id === "string")
    );

    const taskList = tasks
      .map((t: { id: string; task_text: string }) => `[id=${t.id}] ${t.task_text}`)
      .join("\n");

    const systemPrompt = `You find duplicate or near-duplicate tasks in a user's todo list.

Two tasks should be clustered together ONLY if they describe the same intended piece of work, even if worded differently. Examples of duplicates:
- "Enhance Project Hub user interface" and "improve Project Hub UI"
- "Add Customer Projects to CSP main page" and "Display Customer Projects on CSP homepage"

DO NOT cluster tasks that are merely related, share a project name, or involve the same person. Different actions on the same project are NOT duplicates.

You MUST respond by calling the report_duplicates tool. Rules:
- Only return clusters of 2 or more task ids.
- Each id must come from the input. Do not invent ids.
- An id may appear in at most one cluster.
- If there are no duplicates, return an empty clusters array.
- Provide a short reason (under 10 words) for each cluster.`;

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
          { role: "user", content: `Find duplicates in these tasks:\n\n${taskList}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_duplicates",
              description: "Report clusters of duplicate tasks.",
              parameters: {
                type: "object",
                properties: {
                  clusters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task_ids: { type: "array", items: { type: "string" } },
                        reason: { type: "string" },
                      },
                      required: ["task_ids", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["clusters"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_duplicates" } },
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
    const args = toolCall?.function?.arguments;
    let rawClusters: Array<{ task_ids: string[]; reason: string }> = [];
    if (args) {
      try {
        const parsed = JSON.parse(args);
        if (Array.isArray(parsed.clusters)) rawClusters = parsed.clusters;
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    // Validate: dedupe ids per cluster, ensure each id is valid and used at most once.
    const seen = new Set<string>();
    const clusters = rawClusters
      .map((c) => {
        const ids = (c.task_ids || []).filter(
          (id) => typeof id === "string" && validIds.has(id) && !seen.has(id)
        );
        const unique = [...new Set(ids)];
        unique.forEach((id) => seen.add(id));
        return { task_ids: unique, reason: typeof c.reason === "string" ? c.reason : "" };
      })
      .filter((c) => c.task_ids.length >= 2);

    return new Response(JSON.stringify({ clusters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-detect-duplicate-tasks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
