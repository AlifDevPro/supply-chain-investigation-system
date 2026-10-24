/** Same-origin relative path only. Rejects protocol-relative and backslash tricks. */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (value.length > 200 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\n")) {
    return "/";
  }
  return value;
}
