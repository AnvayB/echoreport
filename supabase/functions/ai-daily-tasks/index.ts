import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entry, completed_tasks, incomplete_carryover, completed_exclusion } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let completedContext = "";
    if (completed_tasks && completed_tasks.length > 0) {
      completedContext = "\n\nYesterday's task completion status (from checkboxes):\n" +
        completed_tasks.map((t: { task_text: string; completed: boolean; section: string }) =>
          `- [${t.completed ? "DONE" : "NOT DONE"}] (${t.section}) ${t.task_text}`
        ).join("\n");
    }

    let exclusionContext = "";
    if (completed_exclusion && completed_exclusion.length > 0) {
      exclusionContext = "\n\nEXCLUSION LIST — these tasks were explicitly COMPLETED yesterday (via checkbox). They MUST appear ONLY in 'Completed Yesterday' and MUST NOT appear in 'Pending for Today' or 'Carryover', even if the EOD Pending text mentions them:\n" +
        completed_exclusion.map((t: string) => `- ${t}`).join("\n");
    }

    let carryoverContext = "";
    if (incomplete_carryover && incomplete_carryover.length > 0) {
      carryoverContext = "\n\nUnchecked tasks from past days (MUST appear in today's plan as carryover or pending — do NOT drop them):\n" +
        incomplete_carryover.map((t: { task_text: string; task_date: string; section: string }) =>
          `- (from ${t.task_date}, ${t.section}) ${t.task_text}`
        ).join("\n");
    }

    const systemPrompt = `You are a productivity assistant. Given the user's previous workday entry, create a clear task breakdown for today.

You MUST respond with valid JSON only. No markdown, no code fences, no explanation. The JSON must follow this exact structure:

{
  "sections": [
    { "title": "Completed Yesterday", "items": ["item1", "item2"] },
    { "title": "Pending for Today", "subsections": [
      { "title": "Theme/Project name", "items": ["item1", "item2"] },
      { "title": "Another theme", "items": ["item3"] }
    ]},
    { "title": "Carryover, Blockers & Follow-ups", "items": ["item1"] }
  ]
}

Rules:
- "Completed Yesterday" and "Carryover, Blockers & Follow-ups" use a flat "items" array of strings.
- "Pending for Today" MUST use "subsections" (NOT "items"). Group today's tasks into 2-5 logical subsections by project, theme, or workstream. Each subsection has a short "title" (2-5 words) and an "items" array.
- If there are very few pending tasks (<=3 total), you may use a single subsection titled "General".
- Items should be concise, professional strings (no emojis, no bullet markers).
- Always include all three top-level sections, even if empty.

CRITICAL CARRYOVER RULES:
- "Completed Yesterday" MUST include BOTH the user's accomplishments text AND every task marked DONE in yesterday's checkbox status. Merge/dedupe sensibly.
- Every task marked NOT DONE from yesterday's checkboxes, AND every unchecked task from past days listed below, MUST appear somewhere in today's plan — either inside "Pending for Today" subsections (if still actionable today) or in "Carryover, Blockers & Follow-ups". Never drop a pending task silently.
- Preserve the original wording of carryover tasks closely; only lightly rephrase for clarity.

RECONCILIATION RULES (extremely important):
- The "Pending Tasks" text in the entry below is a SNAPSHOT written before checkboxes were toggled. Treat the EXCLUSION LIST and the DONE checkbox statuses as AUTHORITATIVE: if an item from the Pending Tasks prose matches (even loosely) an item in the exclusion list, place it ONLY in "Completed Yesterday".
- Carryover (unchecked from past days) and explicit checkbox NOT DONE items take PRIORITY over re-extracting tasks from the Pending Tasks prose. Do not duplicate them.
- Do NOT invent tasks. Every item in today's plan must be grounded in: (a) the EOD entry text, (b) explicit carryover from past days, or (c) checkbox NOT DONE items from yesterday.`;

    const userPrompt = `Here is my entry from the previous workday:

Accomplishments: ${entry.accomplishments || "None recorded"}
Pending Tasks: ${entry.pending_tasks || "None recorded"}
Blockers: ${entry.blockers || "None recorded"}
Notes: ${entry.notes || "None recorded"}${completedContext}${exclusionContext}${carryoverContext}

What are my tasks for today?`;

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
    const content = data.choices?.[0]?.message?.content || "";
    
    // Try to parse as JSON, strip code fences if present
    let parsed;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: return as markdown summary
      return new Response(JSON.stringify({ summary: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sections: parsed.sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-daily-tasks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
