// Business-hours check: is the business open right now (in its timezone)?
import type { BusinessHours } from "../agent-config";

/** True when `now` falls inside the configured open window (and not a holiday). */
export function isBusinessOpen(hours: BusinessHours, now = new Date()): boolean {
  const tz = hours.timezone;
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (hours.holidays.includes(ymd)) return false;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now)
  );
  const window = hours.days[String(weekday)];
  if (!window) return false;
  const [open, close] = window;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return hm >= open && hm < close;
}
