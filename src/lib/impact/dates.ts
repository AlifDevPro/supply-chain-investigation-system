/**
 * Calendar-date arithmetic for business dates (promised dates, ETAs, required-by dates).
 * Business dates are date-only values interpreted as UTC calendar days, so results never depend on the
 * server's time zone or on daylight-saving transitions.
 */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`Invalid calendar date "${value}". Expected YYYY-MM-DD.`);
    this.name = "InvalidDateError";
  }
}

function toUtcMs(value: string): number {
  const m = DATE.exec(value);
  if (!m) throw new InvalidDateError(value);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new InvalidDateError(value);
  }
  return ms;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`Days must be an integer, got ${days}`);
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The UTC calendar date of an instant. */
export function utcDate(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new InvalidDateError(String(instant));
  return d.toISOString().slice(0, 10);
}

export function isValidDate(value: string): boolean {
  try {
    toUtcMs(value);
    return true;
  } catch {
    return false;
  }
}
