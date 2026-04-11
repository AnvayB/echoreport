import { startOfWeek, endOfWeek, addWeeks, format, eachDayOfInterval, isWeekend, isSameDay, parseISO } from "date-fns";

export function getWeekRange(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(date, { weekStartsOn: 1 }); // Sunday
  const friday = new Date(start);
  friday.setDate(friday.getDate() + 4);
  return { start, end, friday };
}

export function getWeekdays(date: Date) {
  const { start } = getWeekRange(date);
  const friday = new Date(start);
  friday.setDate(friday.getDate() + 4);
  return eachDayOfInterval({ start, end: friday });
}

export function formatWeekLabel(date: Date) {
  const { start, friday } = getWeekRange(date);
  return `${format(start, "MMMM d")} – ${format(friday, "MMMM d, yyyy")}`;
}

export function navigateWeek(date: Date, direction: number) {
  return addWeeks(date, direction);
}

export function formatDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function formatDayLabel(date: Date) {
  return format(date, "EEEE, MMMM d");
}

export function getWeekStartKey(date: Date) {
  return formatDateKey(getWeekRange(date).start);
}

export function getWeekEndKey(date: Date) {
  const { friday } = getWeekRange(date);
  return formatDateKey(friday);
}

export function getPreviousWorkday(date: Date): Date {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  while (isWeekend(prev)) {
    prev.setDate(prev.getDate() - 1);
  }
  return prev;
}
