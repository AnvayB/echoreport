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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const validIds = new Set<string>(
      tasks.map((t: { id: string }) => t.id).filter((id: unknown) => typeof id === "string")
    );

    const taskList = tasks
      .map((t: { id: string; task_text: string }) => `[id=${t.id}] ${t.task_text}`)
      .join("\n");

    const systemPrompt = `You find DUPLICATE tasks in a user's todo list. Be EXTREMELY CONSERVATIVE — when in doubt, return empty clusters.

Two tasks are duplicates ONLY when ALL of these are true:
1. They describe the SAME action (or a clear synonym like enhance/improve, add/display, email/send).
2. They have the SAME specific deliverable/object — not just the same project, person, or tool.
3. Completing one task would fully satisfy the other with no remaining work.

DUPLICATES (same action + same deliverable):
- "Enhance Project Hub user interface" / "Improve Project Hub UI"
- "Add Customer Projects to CSP main page" / "Display Customer Projects on CSP homepage"
- "Email Sarah about Q3 budget" / "Send Sarah the Q3 budget email"

NOT DUPLICATES — do NOT cluster these:
- "Enhance Project Hub user interface" / "Develop product analytics view"  ← different deliverables
- "Enhance Project Hub UI" / "Fix bug in Project Hub login"  ← same project, different work
- "Review PR #123" / "Review PR #456"  ← same action type, different specific targets
- "Update DESIGN REVIEW with comments from Santhosh" / "Update KILLER BUGS with comments from Santhosh"  ← same template/pattern but DIFFERENT documents (DESIGN REVIEW ≠ KILLER BUGS)
- "Update X with feedback from Alice" / "Update Y with feedback from Alice"  ← same collaborator is NOT enough; X and Y must be the same thing
- Any two tasks that just share a project name, person name, or tool name

CRITICAL RULE: Tasks that follow the same template or phrasing pattern (e.g., "Update [document] with [person]'s comments") are NOT duplicates unless [document] is identical. The specific noun or deliverable is what matters, not the surrounding words.

NEVER cluster tasks just because they share a prefix, marker, or formatting like "!!", "IMPORTANT", "TODO", bullet style, or capitalization. Ignore those markers entirely when comparing — only the underlying action + deliverable matter. A shared importance flag is NOT evidence of duplication.

If you cannot point to a specific shared deliverable (same document name, same feature, same message to the same person about the same topic), return an empty clusters array.

You MUST respond by calling the report_duplicates tool. Rules:
- Only return clusters of 2 or more task ids.
- Each id must come from the input. Do not invent ids.
- An id may appear in at most one cluster.
- Default to returning empty clusters. False positives are significantly worse than misses.
- Provide a short reason (under 10 words) for each cluster.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
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
      const t = await response.text();
      console.error("AI error:", response.status, t);
      // Degrade gracefully: return empty result so the UI keeps working.
      return new Response(
        JSON.stringify({ clusters: [], unavailable: true, status: response.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
