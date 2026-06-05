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
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return new Response(JSON.stringify({ groups: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const taskList = tasks
      .map((t: { id: string; task_text: string }, i: number) => `${i + 1}. [id=${t.id}] ${t.task_text}`)
      .join("\n");

    const systemPrompt = `You group tasks by project, theme, or workstream so the user can scan them quickly.

You MUST respond by calling the group_tasks tool. Rules:
- Pick 2-6 short, specific group titles (2-5 words each) based on the actual tasks. Examples: "Databricks Integration", "Jira Sync", "ACL Coordination", "Hubspot Dataset". Avoid generic catch-alls like "Other" unless absolutely necessary.
- Every input task id MUST appear in exactly ONE group. Do not invent ids. Do not drop any.
- Order groups roughly by size (largest first).
- Within each group, preserve the order the tasks were given.`;

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
          { role: "user", content: `Group these tasks:\n\n${taskList}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "group_tasks",
              description: "Return tasks grouped by project/theme.",
              parameters: {
                type: "object",
                properties: {
                  groups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        task_ids: { type: "array", items: { type: "string" } },
                      },
                      required: ["title", "task_ids"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["groups"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "group_tasks" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      // Degrade gracefully: return empty groups so the UI falls back to a single "General" group.
      return new Response(
        JSON.stringify({ groups: [], unavailable: true, status: response.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let groups: Array<{ title: string; task_ids: string[] }> = [];
    if (args) {
      try {
        const parsed = JSON.parse(args);
        if (Array.isArray(parsed.groups)) groups = parsed.groups;
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    return new Response(JSON.stringify({ groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-group-tasks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
