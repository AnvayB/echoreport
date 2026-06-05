// Classifies a list of candidate tokens as person names vs not.
// Uses a per-user persistent cache (known_names table) so AI runs only once per token per user.
// Returns { names: string[], notNames: string[] } — covering ALL inputs that have a verdict.
//
// Input shape (preferred):
//   { candidates: [{ token: string, contexts?: string[] }, ...] }
// Backward-compatible: { candidates: string[] } is also accepted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CandidateInput = string | { token: string; contexts?: string[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidates } = await req.json();
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(JSON.stringify({ names: [], notNames: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize input into a Map<token, Set<context>>
    const ctxMap = new Map<string, Set<string>>();
    for (const raw of candidates as CandidateInput[]) {
      let token: string | null = null;
      let contexts: string[] = [];
      if (typeof raw === "string") {
        token = raw;
      } else if (raw && typeof raw === "object" && typeof raw.token === "string") {
        token = raw.token;
        if (Array.isArray(raw.contexts)) contexts = raw.contexts.filter((c) => typeof c === "string");
      }
      if (!token) continue;
      const t = token.trim();
      if (!t || t.length >= 80) continue;
      let set = ctxMap.get(t);
      if (!set) {
        set = new Set();
        ctxMap.set(t, set);
      }
      for (const c of contexts) {
        const cc = c.trim();
        if (cc && cc.length < 500) set.add(cc);
        if (set.size >= 3) break;
      }
    }

    const unique = Array.from(ctxMap.keys()).slice(0, 200);

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

    // Build context-rich payload for the model
    const payload = toClassify.map((token) => ({
      token,
      contexts: Array.from(ctxMap.get(token) ?? []),
    }));

    const systemPrompt = [
      "You classify capitalized tokens extracted from short work-task notes.",
      "For each token, decide if it refers to a REAL PERSON (someone the writer would email, call, message, or meet with) given the surrounding task text.",
      "",
      "Mark as PERSON only when the context strongly supports it: e.g. 'sync with Gilles', 'email Sarah about Q3', 'ask Marie for feedback', 'thank Jon for the PR'.",
      "",
      "Mark as NOT a person for:",
      "- Company names (Arteris, Stripe, Acme)",
      "- Products, tools, software (Jira, Slack, Figma, Notion, Linear, GitHub)",
      "- Projects, repos, features, modules (Project Hub, Hub, Checkout, Dashboard, Onboarding)",
      "- Places, technologies, frameworks, libraries",
      "- Acronyms, ticket IDs, model names, generic capitalized nouns",
      "- Sentence-initial verbs/nouns that happen to be capitalized",
      "",
      "When uncertain, EXCLUDE. False positives are worse than misses — the user has no way to correct them.",
      "Use ALL provided contexts for a token together before deciding. The same token across multiple contexts that all clearly refer to a person is a strong signal; mixed/ambiguous usage → exclude.",
    ].join("\n");

    const userPrompt =
      "Classify each token. Return only the tokens that are person names.\n\n" +
      JSON.stringify(payload, null, 2);

    const callModel = async (model: string, body: unknown) => {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return r;
    };

    const firstPassBody = {
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_names",
            description: "Report which input tokens are person names, with brief reasoning.",
            parameters: {
              type: "object",
              properties: {
                verdicts: {
                  type: "array",
                  description: "One entry per input token.",
                  items: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      is_person: { type: "boolean" },
                      reasoning: {
                        type: "string",
                        description: "One short sentence justifying the verdict using the context.",
                      },
                    },
                    required: ["token", "is_person", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["verdicts"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_names" } },
    };

    const resp = await callModel("gpt-4o", firstPassBody);

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
    let aiNames = new Set<string>();
    try {
      const args = JSON.parse(call?.function?.arguments ?? "{}");
      const inputSet = new Set(toClassify);
      if (Array.isArray(args.verdicts)) {
        for (const v of args.verdicts) {
          if (v && typeof v.token === "string" && inputSet.has(v.token) && v.is_person === true) {
            aiNames.add(v.token);
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse tool args", e);
    }

    // ── Verifier pass: re-check only the positives with a smaller model ──
    if (aiNames.size > 0) {
      const positives = Array.from(aiNames).map((token) => ({
        token,
        contexts: Array.from(ctxMap.get(token) ?? []),
      }));

      const verifierBody = {
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a strict verifier. For each candidate, decide whether it is unambiguously a real person's name given the contexts. Reject anything that could plausibly be a company, product, tool, project, repo, place, acronym, or generic noun. When in doubt, REJECT.",
          },
          {
            role: "user",
            content:
              "Confirm which of these candidates are person names:\n" +
              JSON.stringify(positives, null, 2),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "confirm_names",
              parameters: {
                type: "object",
                properties: {
                  confirmed: { type: "array", items: { type: "string" } },
                },
                required: ["confirmed"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "confirm_names" } },
      };

      try {
        const vr = await callModel("gpt-4o-mini", verifierBody);
        if (vr.ok) {
          const vdata = await vr.json();
          const vcall = vdata?.choices?.[0]?.message?.tool_calls?.[0];
          const vargs = JSON.parse(vcall?.function?.arguments ?? "{}");
          if (Array.isArray(vargs.confirmed)) {
            const confirmedSet = new Set<string>(
              vargs.confirmed.filter((s: unknown) => typeof s === "string"),
            );
            // Intersect — verifier can only downgrade, not add
            aiNames = new Set([...aiNames].filter((t) => confirmedSet.has(t)));
          }
        } else {
          console.warn("verifier non-ok", vr.status);
        }
      } catch (e) {
        console.warn("verifier failed (keeping first-pass verdicts)", e);
      }
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
