/**
 * SYNTHETIC presets for the "Submit synthetic signal" form. They are ordinary submissions: the server runs them
 * through the same validation, deduplication and triage as an API call. Submitting "Resend" after
 * "Supplier delay" demonstrates deduplication; "Revised" demonstrates a revision.
 */
export interface SignalPreset {
  id: string;
  label: string;
  hint: string;
  body: unknown;
}

const SYSTEM = "Mailbox: procurement@ (synthetic form)";

const supplierDelay = {
  sourceType: "supplier_email",
  sourceSystem: SYSTEM,
  sourceRecordId: "MSG-FORM-1",
  label: "Supplier notice: PO-77410 button delivery delayed three days",
  references: { purchaseOrder: "PO-77410", material: "BT-1204" },
  quantity: { value: 2400, unit: "pcs" },
  dataMode: "synthetic",
};

export const SIGNAL_PRESETS: readonly SignalPreset[] = [
  { id: "supplier-delay", label: "Supplier delay", hint: "Expected: relevant (delay language with a purchase order).", body: supplierDelay },
  { id: "resend", label: "Resend of the supplier delay", hint: "Identical to Supplier delay. Expected: exact duplicate, not triaged again.", body: supplierDelay },
  {
    id: "revised",
    label: "Revised supplier delay",
    hint: "Same record id, changed content. Expected: revision, held for review.",
    body: { ...supplierDelay, excerpt: "Update from supplier: the delay is now six days." },
  },
  {
    id: "quality-failure",
    label: "Quality inspection failure",
    hint: "Expected: high impact, held for review.",
    body: {
      sourceType: "quality_record",
      sourceSystem: "Quality system (synthetic form)",
      label: "Inspection failed: care label lot CL-5521",
      references: { lot: "CL-5521" },
      attributes: { inspectionResult: "failed" },
      dataMode: "synthetic",
    },
  },
  {
    id: "routine-sync",
    label: "Routine stock sync",
    hint: "Expected: irrelevant by the routine-sync allowlist; still recorded.",
    body: {
      sourceType: "inventory_balance",
      sourceSystem: "Inventory (synthetic form)",
      label: "Nightly stock sync, warehouse W2",
      attributes: { routineSync: true, varianceDetected: false },
      dataMode: "synthetic",
    },
  },
  {
    id: "ambiguous",
    label: "Ambiguous report",
    hint: "Expected: uncertain, kept and held for review.",
    body: {
      sourceType: "manual_report",
      sourceSystem: "Manual report (synthetic form)",
      label: "Trim supplier hints at a possible schedule change",
      dataMode: "synthetic",
    },
  },
  {
    id: "malformed",
    label: "Malformed signal",
    hint: "Expected: rejected with field-level errors; the rejection is still recorded.",
    body: { sourceType: "supplier_email", sourceSystem: "Mailbox (synthetic form)", label: "", unexpectedField: true, dataMode: "real" },
  },
];

export const presetText = (preset: SignalPreset) => JSON.stringify(preset.body, null, 2);
