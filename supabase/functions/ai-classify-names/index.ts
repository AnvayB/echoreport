// Classifies a list of candidate tokens as person names vs not.
// Returns { names: string[] } — the subset that ARE person first/full names.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidates } = await req.json();
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(JSON.stringify({ names: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unique = Array.from(
      new Set(
        candidates
          .filter((c: unknown) => typeof c === "string")
          .map((c: string) => c.trim())
          .filter((c) => c.length > 0 && c.length < 80),
      ),
    ).slice(0, 200);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You classify capitalized tokens extracted from short work tasks. Return ONLY the tokens that refer to a real person (first name, last name, or first+last). EXCLUDE: companies, products, tools, software (e.g. Jira, Slack, Figma, Arteris, Notion), places, projects, technologies, acronyms, and generic words. When uncertain, exclude.",
          },
          {
            role: "user",
            content:
              `Classify these tokens. Return only those that are person names:\n${JSON.stringify(unique)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_names",
              description: "Report which input tokens are person names.",
              parameters: {
                type: "object",
                properties: {
                  names: {
                    type: "array",
                    items: { type: "string" },
                    description: "Subset of input tokens that are person names.",
                  },
                },
                required: ["names"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_names" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let names: string[] = [];
    try {
      const args = JSON.parse(call?.function?.arguments ?? "{}");
      if (Array.isArray(args.names)) {
        const inputSet = new Set(unique);
        names = args.names.filter((n: unknown): n is string => typeof n === "string" && inputSet.has(n));
      }
    } catch (e) {
      console.error("Failed to parse tool args", e);
    }

    return new Response(JSON.stringify({ names }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-names error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
