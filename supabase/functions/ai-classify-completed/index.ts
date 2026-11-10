import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    if (!req.headers.get("Authorization")) return json({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const tasks = Array.isArray(body?.tasks) ? body.tasks.slice(0, 150) : [];
    const groups: string[] = Array.isArray(body?.groups)
      ? body.groups.filter((g: unknown) => typeof g === "string" && g.trim()).slice(0, 100)
      : [];
    const valid = tasks.filter(
      (t: any) => t && typeof t.id === "string" && typeof t.task_text === "string",
    );
    if (!valid.length) return json({ assignments: {} });
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY is not configured");

    const system = `You categorize completed work tasks into groups for an analytics dashboard.
Locked groups (use VERBATIM whenever a task reasonably fits): ${groups.join(", ") || "(none)"}.
Use keywords in the task text as strong signals: e.g. "CSP" -> a CSP group, "tickets timeline" -> Tickets Timeline, "project hub" -> Project Hub, "sales quote engine" or "SQE" -> Sales Quote Engine (match to the closest locked group title, case-insensitive, including acronyms).
Sub-areas: company analytics, customer/ticket management, customer tickets -> Tickets Timeline. CSP enhancements or anything CSP -> the CSP overall group. SQE enhancements -> the Sales Quote Engine / SQE group. Read the task description carefully; most tasks name their project explicitly.
Strongly prefer locked groups; do not invent sub-groups of an existing locked group.
Only create a new short group title (2-4 words) when no locked group fits; reuse your new titles consistently. Avoid "Miscellaneous" unless nothing fits. Every id must get exactly one group.`;
    const list = valid.map((t: any) => `[id=${t.id}] ${String(t.task_text).slice(0, 300)}`).join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: system }, { role: "user", content: list }],
        tools: [{
          type: "function",
          function: {
            name: "assign",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "string" }, group: { type: "string" } },
                    required: ["id", "group"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "assign" } },
      }),
    });
    if (!r.ok) throw new Error(`AI error ${r.status}`);
    const data = await r.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
    const ids = new Set(valid.map((t: any) => t.id));
    const assignments: Record<string, string> = {};
    for (const it of args.items ?? []) {
      if (ids.has(it.id) && typeof it.group === "string" && it.group.trim()) assignments[it.id] = it.group.trim().slice(0, 80);
    }
    return json({ assignments });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
