import type { DiscoverySearchParams, DateFilterKey } from "@/lib/discovery/search-params";
import { eventMatchesQuery, eventMatchesScopedQuery } from "@/lib/discovery/search-events";
import { DEFAULT_SORT, sortEvents } from "@/lib/discovery/sort-events";
import type { DiscoveryEvent } from "@/types/event";
import {
  addCalendarDays,
  getCalendarMonthEnd,
  getCalendarWeekday,
  getCyprusDateString,
} from "@/lib/discovery/cyprus-date";

export function getDateRange(key: DateFilterKey, ref = new Date()): { from: string; to: string } {
  const today = getCyprusDateString(ref);

  if (key === "today") {
    return { from: today, to: today };
  }

  if (key === "tomorrow") {
    const tomorrow = addCalendarDays(today, 1);
    return { from: tomorrow, to: tomorrow };
  }

  if (key === "weekend") {
    const day = getCalendarWeekday(today);

    if (day === 0) {
      // Sunday — current weekend is Sat–Sun containing today
      return { from: addCalendarDays(today, -1), to: today };
    }

    if (day === 6) {
      return { from: today, to: addCalendarDays(today, 1) };
    }

    const daysUntilSaturday = 6 - day;
    const saturday = addCalendarDays(today, daysUntilSaturday);
    return { from: saturday, to: addCalendarDays(saturday, 1) };
  }

  if (key === "week") {
    return { from: today, to: addCalendarDays(today, 6) };
  }

  return { from: today, to: getCalendarMonthEnd(today) };
}

export function filterEvents(
  events: DiscoveryEvent[],
  params: DiscoverySearchParams
): DiscoveryEvent[] {
  let result = [...events];

  if (params.q) {
    const scope = params.scope === "artist" ? "artist" : "event";
    result = result.filter((e) =>
      scope === "artist"
        ? eventMatchesScopedQuery(e, params.q!, "artist")
        : eventMatchesQuery(e, params.q!)
    );
  }

  if (params.date) {
    const { from, to } = getDateRange(params.date);
    result = result.filter((e) => e.date >= from && e.date <= to);
  } else if (params.from || params.to) {
    const from = params.from ?? "0000-01-01";
    const to = params.to ?? "9999-12-31";
    result = result.filter((e) => e.date >= from && e.date <= to);
  }

  if (params.district) {
    result = result.filter((e) => e.district === params.district);
  }

  if (params.category) {
    result = result.filter((e) => e.category === params.category);
  }

  return sortEvents(result, params.sort ?? DEFAULT_SORT);
}
