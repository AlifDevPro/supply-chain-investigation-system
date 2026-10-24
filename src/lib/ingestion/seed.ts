import type { CaseReferenceSource } from "./triage";
import type { Clock, ProcessOutcome } from "./pipeline";
import type { SignalRepository } from "@/lib/store/types";
import { ingestAndInvestigate } from "@/lib/investigation/ingest";
import type { ExtractionRunStatus } from "@/lib/investigation/extraction";
import type { InvestigationDeps, InvestigationStatus } from "@/lib/investigation/run";

/**
 * SYNTHETIC demonstration submissions. They go through the real pipeline, so ids, hashes, outcomes and event
 * timestamps are produced honestly by the server at seeding time. Nothing here is operational data.
 */
const SYSTEM = "(synthetic seed)";

export const SEED_SUBMISSIONS: ReadonlyArray<{ note: string; body: unknown }> = [
  {
    note: "relevant: delay notice with a purchase order below the high-impact threshold",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`, sourceRecordId: "MSG-2001",
      label: "Supplier notice: PO-77210 trim delivery delayed two days",
      references: { purchaseOrder: "PO-77210", material: "TR-5502" }, quantity: { value: 1200, unit: "meters" },
      dataMode: "synthetic",
    },
  },
  {
    note: "exact resend of the first message (same record id and content)",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`, sourceRecordId: "MSG-2001",
      label: "Supplier notice: PO-77210 trim delivery delayed two days",
      references: { purchaseOrder: "PO-77210", material: "TR-5502" }, quantity: { value: 1200, unit: "meters" },
      dataMode: "synthetic",
    },
  },
  {
    note: "revision: same record id, changed content",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`, sourceRecordId: "MSG-2001",
      label: "Supplier notice: PO-77210 trim delivery delayed two days",
      excerpt: "Update from supplier: the delay is now five days.",
      references: { purchaseOrder: "PO-77210", material: "TR-5502" }, quantity: { value: 1200, unit: "meters" },
      dataMode: "synthetic",
    },
  },
  {
    note: "uncertain: ambiguous wording, no references",
    body: {
      sourceType: "manual_report", sourceSystem: `Manual report ${SYSTEM}`,
      label: "Label supplier hints at a possible schedule change",
      dataMode: "synthetic",
    },
  },
  {
    note: "irrelevant: positive routine-sync match",
    body: {
      sourceType: "inventory_balance", sourceSystem: `Inventory ${SYSTEM}`,
      label: "Nightly stock sync, warehouse W1",
      attributes: { routineSync: true, varianceDetected: false }, dataMode: "synthetic",
    },
  },
  {
    note: "high impact: failed quality inspection",
    body: {
      sourceType: "quality_record", sourceSystem: `Quality system ${SYSTEM}`,
      label: "Inspection failed: woven label lot WL-3301",
      references: { lot: "WL-3301" }, attributes: { inspectionResult: "failed" }, dataMode: "synthetic",
    },
  },
  {
    note: "high impact: large delayed quantity",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`,
      label: "Supplier says lining fabric LN-2210 will be late",
      references: { purchaseOrder: "PO-77305", material: "LN-2210" }, quantity: { value: 12000, unit: "m" },
      dataMode: "synthetic",
    },
  },
  {
    note: "fingerprint duplicate: the large-quantity notice resent without a record id",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`,
      label: "Supplier says lining fabric LN-2210 will be late",
      references: { purchaseOrder: "PO-77305", material: "LN-2210" }, quantity: { value: 12000, unit: "m" },
      dataMode: "synthetic",
    },
  },
  {
    note: "shipment status update with no delay wording (held unless it matches an open case)",
    body: {
      sourceType: "shipment", sourceSystem: `Carrier tracking ${SYSTEM}`,
      label: "Carrier status update for SHP-30871",
      references: { shipment: "SHP-30871" }, dataMode: "synthetic",
    },
  },
  {
    note: "README example: 8,000 m of navy twill reported four days late (high impact; shortage stays provisional)",
    body: {
      sourceType: "supplier_email", sourceSystem: `Mailbox: procurement@ ${SYSTEM}`, sourceRecordId: "MSG-2101",
      label: "Supplier notice: navy twill NV-4410 for PO-77410 will arrive four days late",
      excerpt: "8,000 m of navy twill will arrive four days later than promised.",
      references: { purchaseOrder: "PO-77410", material: "NV-4410" }, quantity: { value: 8000, unit: "m" },
      dataMode: "synthetic",
    },
  },
  {
    note: "malformed: empty label and a non-synthetic data mode (rejected, still visible)",
    body: { sourceType: "supplier_email", sourceSystem: `Mailbox ${SYSTEM}`, label: "", dataMode: "real" },
  },
];

export interface SeedResult {
  note: string;
  kind: ProcessOutcome["kind"];
  signalId: string;
  investigation: InvestigationStatus | null;
  caseId: string | null;
  extraction: ExtractionRunStatus | null;
}

export async function seedSyntheticSignals(
  tenantId: string,
  deps: { repo: SignalRepository; caseIndex: CaseReferenceSource; investigation: InvestigationDeps; clock?: Clock },
  options: { include?: (submission: (typeof SEED_SUBMISSIONS)[number]) => boolean } = {},
): Promise<SeedResult[]> {
  const results: SeedResult[] = [];
  for (const submission of SEED_SUBMISSIONS) {
    if (options.include && !options.include(submission)) continue;
    const { outcome, investigation, extraction } = await ingestAndInvestigate(tenantId, JSON.stringify(submission.body), deps);
    results.push({
      note: submission.note,
      kind: outcome.kind,
      signalId: outcome.signalId,
      investigation: investigation?.status ?? null,
      caseId: investigation?.caseId ?? null,
      extraction: extraction?.status ?? null,
    });
  }
  return results;
}
