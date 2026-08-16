/** Calendar dates for event discovery — always Europe/Nicosia, never UTC day boundaries. */
export const CYPRUS_TIMEZONE = "Europe/Nicosia";

/** YYYY-MM-DD in Cyprus local calendar (en-CA gives ISO-like ordering). */
export function getCyprusDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CYPRUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Add calendar days to a YYYY-MM-DD string (timezone-neutral date math). */
export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const ys = next.getUTCFullYear();
  const ms = String(next.getUTCMonth() + 1).padStart(2, "0");
  const ds = String(next.getUTCDate()).padStart(2, "0");
  return `${ys}-${ms}-${ds}`;
}

/** Weekday for a calendar date: 0 = Sunday … 6 = Saturday. */
export function getCalendarWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** Last day of the month containing dateStr (YYYY-MM-DD). */
export function getCalendarMonthEnd(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
