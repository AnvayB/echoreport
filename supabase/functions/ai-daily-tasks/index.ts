import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entry, completed_tasks } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let completedContext = "";
    if (completed_tasks && completed_tasks.length > 0) {
      completedContext = "\n\nPrevious task completion status:\n" +
        completed_tasks.map((t: { task_text: string; completed: boolean; section: string }) =>
          `- [${t.completed ? "DONE" : "NOT DONE"}] (${t.section}) ${t.task_text}`
        ).join("\n");
    }

    const systemPrompt = `You are a productivity assistant. Given the user's previous workday entry, create a clear task breakdown for today.

You MUST respond with valid JSON only. No markdown, no code fences, no explanation. The JSON must follow this exact structure:

{
  "sections": [
    { "title": "Completed Yesterday", "items": ["item1", "item2"] },
    { "title": "Pending for Today", "items": ["item1"] },
    { "title": "Carryover, Blockers & Follow-ups", "items": ["item1"] }
  ]
}

Rules:
- Each section must have a "title" and "items" array
- Items should be concise, professional strings (no emojis)
- Always include all three sections, even if items array is empty
- If prior task completion status is provided, use it to inform what carries over vs what was done`;

    const userPrompt = `Here is my entry from the previous workday:

Accomplishments: ${entry.accomplishments || "None recorded"}
Pending Tasks: ${entry.pending_tasks || "None recorded"}
Blockers: ${entry.blockers || "None recorded"}
Notes: ${entry.notes || "None recorded"}${completedContext}

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
