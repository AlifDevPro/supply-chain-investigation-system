import type { z } from "zod";
import {
  MAX_PAYLOAD_BYTES,
  signalInputSchema,
  type SignalInput,
  type ValidationIssue,
} from "@/lib/domain/signal-input";

export type ValidationResult =
  | { ok: true; input: SignalInput; bytes: number }
  | { ok: false; issues: ValidationIssue[]; bytes: number };

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Path segments come from the submitter, so they are restricted to a safe alphabet and length. */
function safeSegment(segment: PropertyKey): string {
  const text = typeof segment === "symbol" ? "?" : String(segment);
  return text.replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 40);
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.map(safeSegment).join(".");
}

/**
 * Converts zod issues to path + code pairs. Messages are deliberately dropped: some zod messages echo the
 * received value, and rejected input must never be reflected back or logged.
 */
export function toSafeIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        out.push({ path: issuePath([...issue.path, key]), code: "unrecognized_key" });
      }
      continue;
    }
    const params = (issue as { params?: { code?: unknown } }).params;
    const code = issue.code === "custom" && typeof params?.code === "string" ? params.code : issue.code;
    out.push({ path: issuePath(issue.path), code });
  }
  return out.slice(0, 20);
}

/** Parse and validate one raw submission. Never throws; never includes submitted values in the result. */
export function validateRawSignal(rawText: string): ValidationResult {
  const bytes = byteLength(rawText);
  if (bytes > MAX_PAYLOAD_BYTES) {
    return { ok: false, bytes, issues: [{ path: "", code: "payload_too_large" }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, bytes, issues: [{ path: "", code: "invalid_json" }] };
  }
  const result = signalInputSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, bytes, issues: toSafeIssues(result.error.issues) };
  }
  return { ok: true, bytes, input: result.data };
}
