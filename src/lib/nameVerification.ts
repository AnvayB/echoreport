// Client-side cache + AI verification for name candidates.
// Stores per-token verdicts in localStorage so repeat tokens are instant.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "nameVerify.v1";
const MAX_CACHE = 1000;

type Verdict = "name" | "not_name";
type CacheShape = Record<string, Verdict>;

let cache: CacheShape | null = null;
const subscribers = new Set<() => void>();
const inFlight = new Set<string>();

function loadCache(): CacheShape {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist() {
  if (!cache) return;
  try {
    // Cap cache size — drop oldest-ish (just slice keys).
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) {
      const trimmed: CacheShape = {};
      for (const k of keys.slice(-MAX_CACHE)) trimmed[k] = cache[k];
      cache = trimmed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function notify() {
  subscribers.forEach((cb) => cb());
}

export function subscribeNameVerify(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Returns: true = verified name, false = verified not-name, undefined = unknown */
export function getVerdict(token: string): boolean | undefined {
  const c = loadCache();
  const v = c[normalize(token)];
  if (v === "name") return true;
  if (v === "not_name") return false;
  return undefined;
}

function normalize(t: string): string {
  return t.trim();
}

/** Manually override a verdict (e.g. via right-click). Persists to server. */
export async function setVerdict(token: string, isName: boolean): Promise<void> {
  const t = normalize(token);
  if (!t) return;
  const c = loadCache();
  c[t] = isName ? "name" : "not_name";
  if (!isName && t.includes(" ")) {
    for (const part of t.split(/\s+/)) {
      const p = normalize(part);
      if (p) c[p] = "not_name";
    }
  }
  persist();
  notify();

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const rows: { user_id: string; token: string; is_name: boolean }[] = [
      { user_id: userId, token: t, is_name: isName },
    ];
    if (!isName && t.includes(" ")) {
      for (const part of t.split(/\s+/)) {
        const p = normalize(part);
        if (p) rows.push({ user_id: userId, token: p, is_name: false });
      }
    }
    await supabase
      .from("known_names")
      .upsert(rows, { onConflict: "user_id,token" });
  } catch (e) {
    console.warn("setVerdict persist failed", e);
  }
}

/** Submit candidate tokens for AI classification. Debounced/batched. */
const queue: Map<string, Set<string>> = new Map();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function verifyCandidates(tokens: string[], context?: string) {
  const c = loadCache();
  let added = false;
  const ctx = context?.trim();
  for (const raw of tokens) {
    const t = normalize(raw);
    if (!t) continue;
    if (c[t] !== undefined) continue;
    let ctxSet = queue.get(t);
    if (!ctxSet) {
      if (inFlight.has(t)) continue;
      ctxSet = new Set();
      queue.set(t, ctxSet);
      added = true;
    }
    if (ctx && ctxSet.size < 3) ctxSet.add(ctx);
  }
  if (!added) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 400);
}

async function flush() {
  flushTimer = null;
  if (queue.size === 0) return;
  const entries = Array.from(queue.entries());
  queue.clear();
  const batch = entries.map(([token]) => token);
  batch.forEach((t) => inFlight.add(t));

  try {
    const { data, error } = await supabase.functions.invoke("ai-classify-names", {
      body: {
        candidates: entries.map(([token, ctxSet]) => ({
          token,
          contexts: Array.from(ctxSet),
        })),
      },
    });
    if (error) throw error;
    const names: string[] = Array.isArray(data?.names) ? data.names : [];
    const notNames: string[] = Array.isArray(data?.notNames) ? data.notNames : [];
    const nameSet = new Set(names.map(normalize));
    const notNameSet = new Set(notNames.map(normalize));
    const c = loadCache();
    for (const t of batch) {
      // Prefer explicit verdicts from server; fall back to "not_name" for
      // anything in the batch the server didn't return (defensive).
      if (nameSet.has(t)) c[t] = "name";
      else if (notNameSet.has(t)) c[t] = "not_name";
      else c[t] = "not_name";
    }
    persist();
    notify();
  } catch (e) {
    console.warn("name verification failed", e);
    // Don't cache failures — let them retry next render.
  } finally {
    batch.forEach((t) => inFlight.delete(t));
  }
}
