// Strips common filler phrases from task text and rewrites as an imperative action item.
// Applied client-side as a safety net so the behavior is LLM-agnostic.
const FILLER_PREFIX_RE =
  /^[\s\-*•]*(?:i\s+)?(?:need(?:ed)?\s+to|have\s+to|got\s+to|gotta|should|must|want\s+to|going\s+to|gonna|will|would\s+like\s+to|i(?:'m|'ll|'d)?\s+(?:going\s+to|gonna|need\s+to|want\s+to|will|should|plan\s+to|think\s+i\s+should|still\s+need\s+to)|still\s+need\s+to|also\s+need\s+to|we\s+need\s+to|we\s+should|also\s+(?:need|want)\s+to|try\s+to|remember\s+to|don't\s+forget\s+to|make\s+sure\s+to)\s+/i;

export const stripTaskFiller = (text: string): string => {
  const stripped = text.replace(FILLER_PREFIX_RE, "").trimStart();
  if (!stripped) return text;
  // Capitalize first letter without lowercasing the rest.
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

export const normalizeTaskText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.?!,:;]+$/g, "")
    .trim();

export const getTaskSectionFamily = (section: string) => {
  if (section.startsWith("pending")) return "pending";
  if (section.startsWith("completed")) return "completed";
  return section;
};

const GENERIC_TASK_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "based",
  "blocker",
  "by",
  "continue",
  "continuing",
  "development",
  "for",
  "from",
  "follow",
  "guideline",
  "guidelines",
  "in",
  "of",
  "on",
  "the",
  "to",
  "todo",
  "up",
  "update",
  "updated",
  "with",
]);

const simplifyTaskToken = (token: string) => {
  let next = token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (next.endsWith("ies") && next.length > 4) next = `${next.slice(0, -3)}y`;
  else if (next.endsWith("s") && next.length > 4 && !next.endsWith("ss")) next = next.slice(0, -1);
  return next;
};

export const getTaskComparisonTokens = (text: string) =>
  normalizeTaskText(text)
    .replace(/&/g, " and ")
    .replace(/[/:()]/g, " ")
    .replace(/[\u2013\u2014-]/g, " ")
    .split(/\s+/)
    .map(simplifyTaskToken)
    .filter((token) => token.length > 1 && !GENERIC_TASK_WORDS.has(token));

export const areTaskTextsEquivalent = (left: string, right: string) => {
  const normalizedLeft = normalizeTaskText(left);
  const normalizedRight = normalizeTaskText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const leftTokens = [...new Set(getTaskComparisonTokens(left))];
  const rightTokens = [...new Set(getTaskComparisonTokens(right))];
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const leftKey = [...leftTokens].sort().join(" ");
  const rightKey = [...rightTokens].sort().join(" ");
  if (leftKey === rightKey) return true;

  const rightTokenSet = new Set(rightTokens);
  const sharedCount = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  const smallerSize = Math.min(leftTokens.length, rightTokens.length);
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  const overlapRatio = sharedCount / smallerSize;
  const jaccardRatio = sharedCount / unionSize;

  return sharedCount >= 3 && (overlapRatio >= 0.8 || jaccardRatio >= 0.72);
};

export const getTaskDuplicateKey = (task: { task_text: string; section: string }) =>
  `${getTaskSectionFamily(task.section)}::${
    [...new Set(getTaskComparisonTokens(task.task_text))].sort().join(" ") ||
    normalizeTaskText(task.task_text)
  }`;

export const dedupeTaskTexts = (items: string[]) => {
  const unique: string[] = [];

  items.forEach((item) => {
    const key = normalizeTaskText(item);
    if (!key) return;
    if (unique.some((existing) => areTaskTextsEquivalent(existing, item))) return;
    unique.push(item);
  });

  return unique;
};

const getTaskRowPriority = (task: { task_text: string; section: string }) =>
  (task.section === "pending:manual" ? 1000 : 0) +
  new Set(getTaskComparisonTokens(task.task_text)).size * 20 +
  normalizeTaskText(task.task_text).length;

export const mergeDuplicateTaskRows = <T extends { id?: string; task_text: string; section: string }>(rows: T[]) => {
  const unique: T[] = [];
  const duplicateIds = new Set<string>();

  rows.forEach((row) => {
    const matchIndex = unique.findIndex(
      (existing) =>
        getTaskSectionFamily(existing.section) === getTaskSectionFamily(row.section) &&
        areTaskTextsEquivalent(existing.task_text, row.task_text)
    );

    if (matchIndex === -1) {
      unique.push(row);
      return;
    }

    const existing = unique[matchIndex];
    if (getTaskRowPriority(row) > getTaskRowPriority(existing)) {
      if (existing.id) duplicateIds.add(existing.id);
      unique[matchIndex] = row;
      return;
    }

    if (row.id) duplicateIds.add(row.id);
  });

  return { rows: unique, duplicateIds: [...duplicateIds] };
};

export const dedupeTaskRows = <T extends { task_text: string; section: string }>(rows: T[]) => {
  return mergeDuplicateTaskRows(rows).rows;
};
export const IMPORTANT_PREFIX_REGEX = /^\s*(?:!!\s*|important[:\s-]+)/i;

export const isTaskImportant = (text: string) => IMPORTANT_PREFIX_REGEX.test(text);

export const stripImportantPrefix = (text: string) => text.replace(IMPORTANT_PREFIX_REGEX, "");

export const setTaskImportantText = (text: string, important: boolean) => {
  const stripped = stripImportantPrefix(text).trimStart();
  return important ? `!! ${stripped}` : stripped;
};
