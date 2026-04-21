export const normalizeTaskText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.?!,:;]+$/g, "")
    .trim();

export const getTaskSectionFamily = (section: string) =>
  section.startsWith("pending") ? "pending" : section;

export const getTaskDuplicateKey = (task: { task_text: string; section: string }) =>
  `${getTaskSectionFamily(task.section)}::${normalizeTaskText(task.task_text)}`;

export const dedupeTaskTexts = (items: string[]) => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeTaskText(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const dedupeTaskRows = <T extends { task_text: string; section: string }>(rows: T[]) => {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = getTaskDuplicateKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};