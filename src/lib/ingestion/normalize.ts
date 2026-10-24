import {
  normalizeUnit,
  type NormalizedSignal,
  type SignalInput,
} from "@/lib/domain/signal-input";

function text(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function id(value: string | undefined): string | null {
  if (value === undefined) return null;
  const cleaned = text(value).toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalizes a validated input. The original is never modified; the caller stores it separately.
 * Missing optional fields become explicit nulls. No unit conversion, no defaulting.
 */
export function normalizeSignal(input: SignalInput): NormalizedSignal {
  const refs = input.references ?? {};
  const unit = input.quantity ? normalizeUnit(input.quantity.unit) : null;
  const excerpt = input.excerpt === undefined ? null : text(input.excerpt);
  return {
    sourceType: input.sourceType,
    sourceSystem: text(input.sourceSystem),
    sourceRecordId: id(input.sourceRecordId),
    sourceReportedAt: input.sourceReportedAt ? new Date(input.sourceReportedAt).toISOString() : null,
    label: text(input.label),
    excerpt: excerpt && excerpt.length > 0 ? excerpt : null,
    references: {
      purchaseOrder: id(refs.purchaseOrder),
      material: id(refs.material),
      shipment: id(refs.shipment),
      lot: id(refs.lot),
      productionOrder: id(refs.productionOrder),
    },
    quantity: input.quantity && unit ? { value: input.quantity.value, unit } : null,
    attributes: {
      inspectionResult: input.attributes?.inspectionResult ?? null,
      routineSync: input.attributes?.routineSync ?? null,
      varianceDetected: input.attributes?.varianceDetected ?? null,
    },
    dataMode: input.dataMode,
  };
}
