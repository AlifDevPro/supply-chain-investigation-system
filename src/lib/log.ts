/**
 * Structured server logging (AGENTS.md 18). Fields must be safe: ids, counts, codes. Never payloads,
 * credentials or connection strings. Silent under test. Written as one JSON line to stdout/stderr.
 */
export function logEvent(level: "info" | "warn" | "error", message: string, fields: Record<string, string | number | boolean | null> = {}): void {
  if (process.env.VITEST) return;
  const line = `${JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields })}\n`;
  (level === "info" ? process.stdout : process.stderr).write(line);
}
