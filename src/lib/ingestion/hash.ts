import { createHash } from "node:crypto";
import { REFERENCE_KEYS, type NormalizedSignal } from "@/lib/domain/signal-input";

/** Deterministic JSON with sorted keys, so equal content always hashes equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash of the whole normalized record. Any change in content (including the excerpt) changes it. */
export function contentHash(signal: NormalizedSignal): string {
  return sha256(canonicalJson(signal));
}

/**
 * Identity of "the same report" when no source record id exists. Excludes the excerpt and every timestamp so a
 * resend with new wording or a new timestamp still matches, while any change in what is being reported
 * (source, references, quantity, label) does not.
 */
export function fingerprint(signal: NormalizedSignal): string {
  const references = REFERENCE_KEYS.map((key) => [key, signal.references[key]]);
  return sha256(
    canonicalJson({
      sourceType: signal.sourceType,
      sourceSystem: signal.sourceSystem,
      references,
      quantity: signal.quantity,
      label: signal.label.toLowerCase(),
    }),
  );
}
