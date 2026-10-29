// No server-only: client components format dates too. Every format fixes its time zone, so the
// result never depends on the time zone of the process or the browser.

// Provisional CRM time zone (spec crm-leads-pipeline, open question 9).
export const CRM_TIME_ZONE = "America/Lima";

const dateTimeFormat = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CRM_TIME_ZONE,
});

// "en-CA" formats as YYYY-MM-DD.
const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: CRM_TIME_ZONE,
});

// A calendar date has no time: it is read and formatted in UTC so the day never shifts.
const calendarDateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" });

// An instant in the CRM time zone: "18 oct 2026, 22:00".
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

// Today's calendar date (YYYY-MM-DD) in the CRM time zone.
export function getTodayDate(now: Date = new Date()): string {
  return isoDateFormat.format(now);
}

// A calendar date (YYYY-MM-DD): "25 oct 2026".
export function formatCalendarDate(date: string): string {
  return calendarDateFormat.format(new Date(`${date}T00:00:00Z`));
}

// YYYY-MM-DD strings compare in calendar order.
export function compareToToday(date: string, today: string): "past" | "today" | "future" {
  if (date < today) return "past";
  return date === today ? "today" : "future";
}
