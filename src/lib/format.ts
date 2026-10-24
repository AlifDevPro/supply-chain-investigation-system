/**
 * Formatting is deterministic and timezone-explicit (UTC) so server and client render identically
 * and a reader never has to guess which zone a timestamp is in.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const TIME_SECONDS = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const DAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

export function formatDateTime(iso: string): string {
  return `${DATE_TIME.format(new Date(iso)).replace(",", "")} UTC`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${TIME_SECONDS.format(d)}.${ms}`;
}

export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}

/** `null` means the duration was not measured; say so instead of showing 0. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "not measured";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(s < 10 ? 2 : 1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function formatGap(fromIso: string, toIso: string): string {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (ms < 0) return "out of order";
  return formatDuration(ms);
}

export function formatQuantity(value: number | null, unit: string | null): string {
  if (value === null) return "missing";
  const n = value.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return unit ? `${n} ${unit}` : n;
}

/** "navy_twill" style tokens to readable text. */
export function humanize(token: string): string {
  const t = token
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\berp\b/gi, "ERP");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
