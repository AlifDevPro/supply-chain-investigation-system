import type { SignalInput } from "@/lib/domain/signal-input";
import { normalizeSignal } from "./normalize";
import { contentHash, fingerprint } from "./hash";

/** Test-only builders. */
export function makeInput(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    sourceType: "supplier_email",
    sourceSystem: "Mailbox: procurement@ (synthetic)",
    label: "Supplier notice: navy twill NV-4471 delayed four days",
    references: { purchaseOrder: "po-88001", material: "nv-9000" },
    quantity: { value: 8000, unit: "meters" },
    dataMode: "synthetic",
    ...overrides,
  };
}

export function makeRaw(overrides: Partial<SignalInput> = {}): string {
  return JSON.stringify(makeInput(overrides));
}

export function makeNormalized(overrides: Partial<SignalInput> = {}) {
  const normalized = normalizeSignal(makeInput(overrides));
  return { normalized, contentHash: contentHash(normalized), fingerprint: fingerprint(normalized) };
}
