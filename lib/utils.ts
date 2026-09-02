import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The warehouse's working day. Stocktakes are counted in IST, so that is the
 * day a count belongs to — not the browser's timezone and not UTC.
 *
 * These mirror the server's definition in backend/routes/items.ts. Both sides
 * must agree, or a screen can say "today" about a day the API disagrees with.
 * The bug this replaces: days were derived as `iso.split("T")[0]`, i.e. the UTC
 * day, so anything counted between 00:00 and 05:30 IST was shown under the
 * previous day.
 */
export const BUSINESS_TIMEZONE = "Asia/Kolkata";

const businessDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The business day ("YYYY-MM-DD") of an instant.
 * Accepts an ISO string or Date; returns "" for missing/unparseable input so
 * callers can keep using it in string comparisons without guarding first.
 */
export function businessDay(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return businessDayFormatter.format(d);
}

/** Today's business day ("YYYY-MM-DD") in IST. */
export function businessToday(): string {
  return businessDayFormatter.format(new Date());
}
