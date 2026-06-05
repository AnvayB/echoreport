
# Better Person Recognition

## Diagnosis

Today's classifier (`ai-classify-names`) sees candidate tokens as a **bare list of strings** — no surrounding sentence, no project context. That's the main reason it misfires: "Arteris", "Hub", "Gilles" all look equally name-like in isolation. Adding an X button patches the symptom; the real fix is giving the model the information a human would use.

A second "checker agent" on top of the same context-free input wouldn't help much — it has the same blind spot. A single, better-informed pass is more accurate **and** cheaper than two weak passes.

## Recommended approach (single upgraded pass, no X needed)

1. **Send context with each candidate.** When `TaskText` queues unknown tokens, also send the task sentence(s) they appear in. The edge function classifies each `{token, contexts[]}` pair, so the model can see e.g. *"sync with Gilles tomorrow"* vs *"ship Arteris integration"*.
2. **Upgrade the model** from `gpt-4o-mini` → `gpt-4o` at `temperature: 0`, matching what we already did for duplicate detection.
3. **Tighten the prompt** with explicit non-person categories observed in this app (project names, tools, repos, tickets, product features) and require the model to justify each verdict internally before answering (chain-of-thought via a hidden `reasoning` field in the tool schema — kept server-side, not returned).
4. **Conservative-by-default**: only mark as person when confidence is high; everything else → `not_name`. This is what removes the need for the X — false positives become rare enough that manual correction isn't worth surfacing.
5. **Optional lightweight verifier** for the *positives only* (cheap, small batch): a second `gpt-4o-mini` call that re-reads each confirmed name with its context and can downgrade it. Runs only on the small "yes" set, so cost stays low. Gated behind a flag so we can A/B.
6. **Remove the X button** from `TaskText.tsx` once accuracy is acceptable. Keep the underlying `setVerdict` API + `known_names` cache so power-users can still correct via a (future) settings page if needed, but the pill UI becomes clean again.

## Why not just a second agent

A verifier on top of context-free input would re-confirm the same wrong guess most of the time. Context is the missing signal — once the first pass has it, a verifier becomes a small refinement, not the main fix.

## Files to change

- `supabase/functions/ai-classify-names/index.ts` — accept `{ candidates: [{token, contexts[]}] }`, upgraded model + prompt, optional verifier pass.
- `src/lib/nameVerification.ts` — change `verifyCandidates` signature to accept contexts; batch by token but carry contexts through.
- `src/components/TaskText.tsx` — pass `displayText` as context when queuing tokens; remove the inline X button and its imports.

## Open questions

- Keep the manual override path (just hidden), or rip it out entirely?
- Run the optional verifier pass from day one, or ship the context-aware single pass first and only add the verifier if accuracy is still off?
