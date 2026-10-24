import { createHash } from "node:crypto";

/** Canonical SHA-256 hex of labelled parameters. Changing a value or label invalidates an approval. */
export function parameterDigest(parameters: readonly { label: string; value: string }[]): string {
  const canonical = [...parameters]
    .map((p) => `${p.label.trim()}=${p.value.trim()}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
