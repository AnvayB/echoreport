// Classifies a list of candidate tokens as person names vs not.
// Uses a per-user persistent cache (known_names table) so AI runs only once per token per user.
// Returns { names: string[], notNames: string[] } — covering ALL inputs that have a verdict.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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
      return new Response(JSON.stringify({ names: [], notNames: [] }), {
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

    // ── Per-user persistent cache lookup ──────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    let userId: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData.user?.id ?? null;
    } catch {
      userId = null;
    }

    const cachedNames = new Set<string>();
    const cachedNotNames = new Set<string>();
    let toClassify = unique;

    if (userId) {
      const { data: cached, error: cacheErr } = await supabase
        .from("known_names")
        .select("token, is_name")
        .in("token", unique);
      if (cacheErr) {
        console.warn("known_names lookup error", cacheErr);
      } else if (cached) {
        for (const row of cached) {
          if (row.is_name) cachedNames.add(row.token);
          else cachedNotNames.add(row.token);
        }
        toClassify = unique.filter(
          (t) => !cachedNames.has(t) && !cachedNotNames.has(t),
        );
      }
    }

    // If everything is cached, return early — no AI call needed.
    if (toClassify.length === 0) {
      return new Response(
        JSON.stringify({
          names: Array.from(cachedNames),
          notNames: Array.from(cachedNotNames),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You classify capitalized tokens extracted from short work tasks. Return ONLY the tokens that refer to a real person (first name, last name, or first+last). EXCLUDE: companies, products, tools, software (e.g. Jira, Slack, Figma, Arteris, Notion), places, projects, technologies, acronyms, and generic words. When uncertain, exclude.",
          },
          {
            role: "user",
            content:
              `Classify these tokens. Return only those that are person names:\n${JSON.stringify(toClassify)}`,
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
    const aiNames = new Set<string>();
    try {
      const args = JSON.parse(call?.function?.arguments ?? "{}");
      if (Array.isArray(args.names)) {
        const inputSet = new Set(toClassify);
        for (const n of args.names) {
          if (typeof n === "string" && inputSet.has(n)) aiNames.add(n);
        }
      }
    } catch (e) {
      console.error("Failed to parse tool args", e);
    }

    // Persist verdicts for this user (best-effort).
    if (userId) {
      const rows = toClassify.map((token) => ({
        user_id: userId,
        token,
        is_name: aiNames.has(token),
      }));
      const { error: upsertErr } = await supabase
        .from("known_names")
        .upsert(rows, { onConflict: "user_id,token" });
      if (upsertErr) console.warn("known_names upsert error", upsertErr);
    }

    // Merge cached + freshly classified into the response.
    const names = new Set<string>([...cachedNames, ...aiNames]);
    const notNames = new Set<string>([
      ...cachedNotNames,
      ...toClassify.filter((t) => !aiNames.has(t)),
    ]);

    return new Response(
      JSON.stringify({ names: Array.from(names), notNames: Array.from(notNames) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("classify-names error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
