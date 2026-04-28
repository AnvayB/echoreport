import { addDays, format, parse, isValid } from "date-fns";
import { getWeekEndKey, formatDateKey } from "./weekUtils";

export type WhenHint = string | null | undefined;

/**
 * Resolve an AI-provided "when" hint into a concrete YYYY-MM-DD task_date,
 * anchored to the user's selected/today date.
 *
 * Hints understood:
 *  - "today"       → anchorKey
 *  - "tomorrow"    → anchor + 1 day
 *  - "this_week"   → Friday of anchor's workweek
 *  - "YYYY-MM-DD"  → that date (must be valid)
 *  - anything else / null → defaultKey (defaults to anchorKey)
 *
 * Hints that resolve to a date BEFORE the anchor are clamped to the anchor
 * (so "Monday" mentioned on Wednesday doesn't accidentally land in the past).
 */
export function resolveWhenHint(
  when: WhenHint,
  anchor: Date,
  defaultKey?: string
): string {
  const anchorKey = formatDateKey(anchor);
  const fallback = defaultKey ?? anchorKey;
  if (!when || typeof when !== "string") return fallback;

  const w = when.trim().toLowerCase();
  if (w === "today" || w === "now" || w === "asap") return anchorKey;
  if (w === "tomorrow" || w === "next_day" || w === "next-day") {
    return formatDateKey(addDays(anchor, 1));
  }
  if (w === "this_week" || w === "this week" || w === "end_of_week" || w === "eow") {
    return getWeekEndKey(anchor);
  }

  // Try YYYY-MM-DD
  const parsed = parse(when, "yyyy-MM-dd", new Date());
  if (isValid(parsed)) {
    const key = format(parsed, "yyyy-MM-dd");
    return key < anchorKey ? anchorKey : key;
  }

  return fallback;
}
