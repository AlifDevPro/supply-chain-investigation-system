/**
 * SYNTHETIC DATA for development and demonstration. Not operational data.
 * Every record carries `dataMode: "synthetic"`; the UI additionally labels it.
 */
import type {
  EventStatus,
  EventType,
  InvestigationCase,
  InvestigationEvent,
  Signal,
  Stage,
} from "@/lib/domain";
import { summarizeClaims } from "@/lib/derive";
import { calculateProvisionalShortage } from "@/lib/impact/shortage";
import { claims2041, impact2041, signal2041 } from "./investigation-2041";

const S = "synthetic" as const;
const TENANT = "tenant-demo";

/** Fixed snapshot. Fixtures never refresh, and the UI says so. */
export const SNAPSHOT_AT = "2026-10-24T04:10:00Z";

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export const signals: Signal[] = [
  signal2041,
  { id: "SIG-8836", sourceType: "quality_record", sourceSystem: "Quality system (synthetic)", label: "Inspection failure: elastic trim lot ET-2290", receivedAt: "2026-10-23T06:15:02Z", triageOutcome: "high_impact", caseId: "INV-2043", correlationId: "corr-8836", dataMode: S },
  { id: "SIG-8842", sourceType: "shipment", sourceSystem: "Carrier tracking (synthetic)", label: "Carrier status update for SHP-30871", receivedAt: "2026-10-23T10:05:00Z", triageOutcome: "related_existing", caseId: "INV-2041", correlationId: "corr-8842", dataMode: S },
  { id: "SIG-8843", sourceType: "inventory_balance", sourceSystem: "Inventory (synthetic)", label: "Routine stock count sync, warehouse W1", receivedAt: "2026-10-23T13:30:00Z", triageOutcome: "irrelevant", caseId: null, correlationId: "corr-8843", dataMode: S },
  { id: "SIG-8844", sourceType: "supplier_email", sourceSystem: "Mailbox: procurement@ (synthetic)", label: "Supplier message, quantity field unreadable", receivedAt: "2026-10-23T15:02:00Z", triageOutcome: "uncertain", caseId: null, correlationId: "corr-8844", dataMode: S },
  { id: "SIG-8846", sourceType: "manual_report", sourceSystem: "Manual report (synthetic)", label: "Packaging supplier mentions a possible schedule change", receivedAt: "2026-10-23T16:40:00Z", triageOutcome: "uncertain", caseId: "INV-2044", correlationId: "corr-8846", dataMode: S },
  { id: "SIG-8847", sourceType: "supplier_email", sourceSystem: "Mailbox: procurement@ (synthetic)", label: "Re-sent supplier notice for navy twill NV-4471", receivedAt: "2026-10-24T02:11:00Z", triageOutcome: "relevant", caseId: null, correlationId: "corr-8847", dataMode: S },
  { id: "SIG-8848", sourceType: "inventory_balance", sourceSystem: "Inventory (synthetic)", label: "Zip stock count variance, warehouse W3", receivedAt: "2026-10-24T03:25:00Z", triageOutcome: "related_existing", caseId: "INV-2039", correlationId: "corr-8848", dataMode: S },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type Draft = Omit<InvestigationEvent, "id" | "sequence" | "tenantId" | "dataMode">;

const at = (iso: string, plusMs = 0) => new Date(Date.parse(iso) + plusMs).toISOString();

function draft(
  corr: string,
  signalId: string | null,
  caseId: string | null,
  type: EventType,
  stage: Stage,
  status: EventStatus,
  time: string,
  durationMs: number | null,
  extra: Partial<Pick<Draft, "method" | "retryCount" | "errorClass" | "metadata">> = {},
): Draft {
  return {
    caseId,
    signalId,
    correlationId: corr,
    type,
    stage,
    status,
    occurredAt: time,
    durationMs,
    method: extra.method ?? null,
    retryCount: extra.retryCount ?? 0,
    errorClass: extra.errorClass ?? null,
    metadata: extra.metadata ?? {},
  };
}

const rule = (name: string) => ({ kind: "rule" as const, name });
const system = (name: string) => ({ kind: "system" as const, name });

/** The first three stages are identical for every ingested signal. */
function ingest(sig: Signal, opts: { duplicateOf?: string; validationFailure?: boolean } = {}): Draft[] {
  const { id, correlationId: corr, receivedAt: t0 } = sig;
  const out: Draft[] = [
    draft(corr, id, null, "signal.received", "received", "completed", t0, 12, {
      method: system("ingest-adapter"),
      metadata: { sourceType: sig.sourceType },
    }),
  ];
  if (opts.validationFailure) {
    out.push(
      draft(corr, id, null, "signal.validated", "validated", "failed", at(t0, 300), 9, {
        method: rule("schema-validation"),
        errorClass: "validation_error",
        metadata: { field: "quantity", reason: "unreadable value" },
      }),
    );
    return out;
  }
  out.push(
    draft(corr, id, null, "signal.validated", "validated", "completed", at(t0, 300), 9, {
      method: rule("schema-validation"),
    }),
    draft(corr, id, null, "signal.deduplicated", "deduplicated", "completed", at(t0, 600), 18, {
      method: rule("fingerprint-v1"),
      metadata: opts.duplicateOf ? { duplicate: true, duplicateOf: opts.duplicateOf } : { duplicate: false },
    }),
  );
  return out;
}

function sigOf(id: string): Signal {
  const s = signals.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown fixture signal ${id}`);
  return s;
}

const sig41 = sigOf("SIG-8841");
const sig36 = sigOf("SIG-8836");
const sig42 = sigOf("SIG-8842");
const sig43 = sigOf("SIG-8843");
const sig44 = sigOf("SIG-8844");
const sig46 = sigOf("SIG-8846");
const sig47 = sigOf("SIG-8847");
const sig48 = sigOf("SIG-8848");

const drafts: Draft[] = [
  // SIG-8836 -> INV-2043: high impact, evidence source failed once, then retried successfully
  ...ingest(sig36),
  draft("corr-8836", "SIG-8836", null, "triage.completed", "triaged", "completed", "2026-10-23T06:15:03.100Z", 410, { method: rule("triage-rules-v1"), metadata: { outcome: "high_impact" } }),
  draft("corr-8836", "SIG-8836", null, "evidence.retrieved", "evidence", "failed", "2026-10-23T06:15:06.200Z", 3000, { errorClass: "source_unavailable", metadata: { source: "Quality system" } }),
  draft("corr-8836", "SIG-8836", null, "evidence.retrieved", "evidence", "retrying", "2026-10-23T06:15:36.200Z", null, { retryCount: 1, metadata: { source: "Quality system" } }),
  draft("corr-8836", "SIG-8836", null, "evidence.retrieved", "evidence", "completed", "2026-10-23T06:15:38.400Z", 2210, { retryCount: 1, metadata: { records: 4 } }),
  draft("corr-8836", "SIG-8836", null, "impact.calculated", "impact", "completed", "2026-10-23T06:15:38.500Z", 5, { method: rule("shortage.v1"), metadata: { status: "provisional" } }),
  draft("corr-8836", "SIG-8836", "INV-2043", "investigation.created", "case", "completed", "2026-10-23T06:15:39.000Z", 48, { method: system("investigation-service"), metadata: { severity: "critical" } }),
  draft("corr-8836", "SIG-8836", "INV-2043", "investigation.needs_review", "review", "waiting", "2026-10-23T06:15:39.100Z", null, { metadata: { reason: "high-impact quality hold" } }),

  // SIG-8841 -> INV-2041 (the README example)
  ...ingest(sig41),
  draft("corr-8841", "SIG-8841", null, "triage.completed", "triaged", "completed", "2026-10-23T09:42:11.000Z", 340, { method: rule("triage-rules-v1"), metadata: { outcome: "relevant" } }),
  draft("corr-8841", "SIG-8841", "INV-2041", "evidence.retrieved", "evidence", "completed", "2026-10-23T09:42:14.100Z", 2000, { method: system("evidence-service"), metadata: { records: 5, sources: 4 } }),
  draft("corr-8841", "SIG-8841", "INV-2041", "impact.calculated", "impact", "completed", "2026-10-23T09:42:15.000Z", 6, { method: rule("shortage.v1"), metadata: { status: "provisional", deficitM: 5500 } }),
  draft("corr-8841", "SIG-8841", "INV-2041", "investigation.created", "case", "completed", "2026-10-23T09:42:15.500Z", 41, { method: system("investigation-service") }),
  draft("corr-8841", "SIG-8841", "INV-2041", "investigation.needs_review", "review", "waiting", "2026-10-23T09:42:16.000Z", null, { metadata: { reason: "conflicting sources; stale production order" } }),

  // SIG-8842 -> updates INV-2041
  ...ingest(sig42),
  draft("corr-8842", "SIG-8842", null, "triage.completed", "triaged", "completed", "2026-10-23T10:05:01.200Z", 295, { method: rule("triage-rules-v1"), metadata: { outcome: "related_existing", matchedCase: "INV-2041" } }),
  draft("corr-8842", "SIG-8842", "INV-2041", "evidence.retrieved", "evidence", "completed", "2026-10-23T10:05:02.700Z", 1400, { method: system("evidence-service"), metadata: { records: 1 } }),
  draft("corr-8842", "SIG-8842", "INV-2041", "impact.calculated", "impact", "completed", "2026-10-23T10:05:02.800Z", 4, { method: rule("shortage.v1"), metadata: { status: "provisional", deficitM: 5500 } }),
  draft("corr-8842", "SIG-8842", "INV-2041", "investigation.updated", "case", "completed", "2026-10-23T10:05:03.000Z", 30, { method: system("investigation-service"), metadata: { change: "evidence added" } }),

  // INV-2038: approved action executed, outcome not yet verified
  draft("corr-inv-2038", null, "INV-2038", "action.approved", "action", "completed", "2026-10-23T14:00:10.000Z", null, { metadata: { approverRole: "Operations manager", actionVersion: 1 } }),
  draft("corr-inv-2038", null, "INV-2038", "action.execution_started", "action", "completed", "2026-10-23T14:00:12.000Z", null, { method: system("action-executor") }),
  draft("corr-inv-2038", null, "INV-2038", "action.execution_completed", "action", "completed", "2026-10-23T14:00:15.000Z", 3000, { method: system("action-executor"), metadata: { result: "request sent; acknowledgement not received" } }),

  // SIG-8843: irrelevant, minimal audited path
  ...ingest(sig43),
  draft("corr-8843", "SIG-8843", null, "triage.completed", "triaged", "completed", "2026-10-23T13:30:01.100Z", 120, { method: rule("triage-rules-v1"), metadata: { outcome: "irrelevant", reason: "routine sync" } }),

  // SIG-8844: failed validation
  ...ingest(sig44, { validationFailure: true }),

  // SIG-8846 -> INV-2044: uncertain, preserved for human review
  ...ingest(sig46),
  draft("corr-8846", "SIG-8846", null, "triage.completed", "triaged", "completed", "2026-10-23T16:40:01.200Z", 260, { method: rule("triage-rules-v1"), metadata: { outcome: "uncertain" } }),
  draft("corr-8846", "SIG-8846", "INV-2044", "investigation.created", "case", "completed", "2026-10-23T16:40:01.500Z", 37, { method: system("investigation-service"), metadata: { severity: "low" } }),
  draft("corr-8846", "SIG-8846", "INV-2044", "investigation.needs_review", "review", "waiting", "2026-10-23T16:40:01.600Z", null, { metadata: { reason: "uncertain triage; preserved for review" } }),

  // SIG-8847: duplicate of SIG-8841, processing stops after deduplication
  ...ingest(sig47, { duplicateOf: "SIG-8841" }),

  // SIG-8848 -> updates INV-2039
  ...ingest(sig48),
  draft("corr-8848", "SIG-8848", null, "triage.completed", "triaged", "completed", "2026-10-24T03:25:01.200Z", 310, { method: rule("triage-rules-v1"), metadata: { outcome: "related_existing", matchedCase: "INV-2039" } }),
  draft("corr-8848", "SIG-8848", "INV-2039", "evidence.retrieved", "evidence", "completed", "2026-10-24T03:25:02.500Z", 1150, { method: system("evidence-service"), metadata: { records: 2 } }),
  draft("corr-8848", "SIG-8848", "INV-2039", "impact.calculated", "impact", "completed", "2026-10-24T03:25:02.600Z", 4, { method: rule("shortage.v1"), metadata: { status: "provisional", deficitPcs: 800 } }),
  draft("corr-8848", "SIG-8848", "INV-2039", "investigation.updated", "case", "completed", "2026-10-24T03:25:02.800Z", 28, { method: system("investigation-service"), metadata: { change: "count variance recorded" } }),
];

/** Sequence numbers follow chronological order, as a real event store would assign them. */
export const events: InvestigationEvent[] = [...drafts]
  .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  .map((d, i) => ({
    ...d,
    id: `EVT-${String(i + 1).padStart(4, "0")}`,
    sequence: i + 1,
    tenantId: TENANT,
    dataMode: S,
  }));

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const noClaims = { verified: 0, reported: 0, inferred: 0, assumed: 0, unknown: 0, conflicted: 0, stale: 0 };

const shortage2043 = calculateProvisionalShortage({
  required: { id: "r", label: "Production requirement", value: 24000, unit: "pcs", state: "reported", evidenceId: null },
  onHand: { id: "o", label: "On-hand elastic trims", value: 18000, unit: "pcs", state: "reported", evidenceId: null },
  reserved: null,
  quality: { released: false, state: "verified", evidenceId: null },
  targetUnit: "pcs",
  calculatedAt: "2026-10-23T06:15:38Z",
});

const shortage2039 = calculateProvisionalShortage({
  required: { id: "r", label: "Production requirement", value: 12000, unit: "pcs", state: "verified", evidenceId: null },
  onHand: { id: "o", label: "On-hand zips", value: 11200, unit: "pcs", state: "verified", evidenceId: null },
  reserved: null,
  quality: { released: true, state: "verified", evidenceId: null },
  targetUnit: "pcs",
  calculatedAt: "2026-10-24T03:25:02Z",
});

function fmtQty(n: number | null, unit: string): string {
  return n === null ? "not calculable" : `${n.toLocaleString("en-US")} ${unit}`;
}

export const cases: InvestigationCase[] = [
  {
    id: "INV-2041",
    title: "Navy twill NV-4471 delivery reported four days late",
    summary:
      "Supplier says PO-77120 (8,000 m) will ship about four days late. Production order PRD-5530 needs 6,000 m by Fri 30 Oct and 500 m is on hand. The deficit is provisional until reservations, quality status and the arrival-date conflict are resolved.",
    state: "needs_review",
    severity: "high",
    ownerName: "R. Hossain",
    ownerRole: "Procurement specialist",
    nextAction: "Resolve conflicting arrival dates; confirm PRD-5530 is current",
    requiresReview: true,
    reviewReason: "Conflicting sources and a stale production order",
    openedAt: "2026-10-23T09:42:15Z",
    updatedAt: "2026-10-23T10:05:03Z",
    impactLabel: `${fmtQty(impact2041.deficit, impact2041.unit)} deficit`,
    impactStatus: impact2041.status,
    shortage: { quantity: impact2041.deficit, unit: impact2041.unit, status: impact2041.status },
    claimSummary: summarizeClaims(claims2041),
    affectedOrders: 1,
    dataMode: S,
  },
  {
    id: "INV-2043",
    title: "Elastic trim lot ET-2290 failed inspection",
    summary:
      "A failed quality inspection puts lot ET-2290 on hold. Held stock is excluded from usable inventory, which may leave three production orders short.",
    state: "needs_review",
    severity: "critical",
    ownerName: "M. Chowdhury",
    ownerRole: "Quality-control specialist",
    nextAction: "Confirm hold scope and which production orders consumed lot ET-2290",
    requiresReview: true,
    reviewReason: "High-impact quality hold on usable inventory",
    openedAt: "2026-10-23T06:15:39Z",
    updatedAt: "2026-10-23T06:15:39Z",
    impactLabel: `${fmtQty(shortage2043.deficit, shortage2043.unit)} deficit`,
    impactStatus: shortage2043.status,
    shortage: { quantity: shortage2043.deficit, unit: shortage2043.unit, status: shortage2043.status },
    claimSummary: { ...noClaims, verified: 2, reported: 1, inferred: 1, unknown: 1 },
    affectedOrders: 3,
    dataMode: S,
  },
  {
    id: "INV-2039",
    title: "Zip stock count variance, warehouse W3",
    summary:
      "System count (11,200 pcs) and the latest cycle count disagree. Reservations are not retrieved, so the 800 pcs deficit for one production order is provisional.",
    state: "investigating",
    severity: "medium",
    ownerName: "T. Akter",
    ownerRole: "Inventory or warehouse manager",
    nextAction: "Retrieve reservation records and re-count W3 bins",
    requiresReview: false,
    reviewReason: null,
    openedAt: "2026-10-22T08:20:00Z",
    updatedAt: "2026-10-24T03:25:02Z",
    impactLabel: `${fmtQty(shortage2039.deficit, shortage2039.unit)} deficit`,
    impactStatus: shortage2039.status,
    shortage: { quantity: shortage2039.deficit, unit: shortage2039.unit, status: shortage2039.status },
    claimSummary: { ...noClaims, verified: 2, reported: 1, conflicted: 1 },
    affectedOrders: 1,
    dataMode: S,
  },
  {
    id: "INV-2044",
    title: "Packaging supplier mentions a possible schedule change",
    summary:
      "An informal report could not be classified. It is preserved for human review rather than discarded; no impact has been quantified.",
    state: "needs_review",
    severity: "low",
    ownerName: "Triage queue",
    ownerRole: "Supply-chain manager",
    nextAction: "Decide whether this relates to an open purchase order",
    requiresReview: true,
    reviewReason: "Uncertain triage outcome; preserved for review",
    openedAt: "2026-10-23T16:40:01Z",
    updatedAt: "2026-10-23T16:40:01Z",
    impactLabel: "No quantified impact yet",
    impactStatus: "none",
    shortage: null,
    claimSummary: { ...noClaims, reported: 1, unknown: 2 },
    affectedOrders: 0,
    dataMode: S,
  },
  {
    id: "INV-2040",
    title: "Purchase order PO-77044 missing delivery terms",
    summary:
      "The ERP copy of PO-77044 has no incoterms or delivery window. The investigation is blocked until the supplier returns a signed copy.",
    state: "blocked",
    severity: "medium",
    ownerName: "R. Hossain",
    ownerRole: "Procurement specialist",
    nextAction: "Waiting on supplier copy of PO-77044",
    requiresReview: false,
    reviewReason: null,
    openedAt: "2026-10-21T11:05:00Z",
    updatedAt: "2026-10-23T08:00:00Z",
    impactLabel: "No quantified impact yet",
    impactStatus: "none",
    shortage: null,
    claimSummary: { ...noClaims, verified: 1, unknown: 2 },
    affectedOrders: 0,
    dataMode: S,
  },
  {
    id: "INV-2038",
    title: "Denim alternate-supplier lead time",
    summary:
      "A supplier request was approved and sent. Execution completed, but no acknowledgement has been received, so the outcome is not verified.",
    state: "awaiting_verification",
    severity: "medium",
    ownerName: "S. Karim",
    ownerRole: "Operations manager",
    nextAction: "Verify that the supplier acknowledged and confirmed lead time",
    requiresReview: false,
    reviewReason: null,
    openedAt: "2026-10-22T09:00:00Z",
    updatedAt: "2026-10-23T14:00:15Z",
    impactLabel: "No quantified impact yet",
    impactStatus: "none",
    shortage: null,
    claimSummary: { ...noClaims, verified: 3, reported: 1 },
    affectedOrders: 0,
    dataMode: S,
  },
  {
    id: "INV-2035",
    title: "Port congestion delay on zipper shipment",
    summary: "The shipment arrived three days late. No production order was affected, confirmed against the receiving record.",
    state: "resolved",
    severity: "low",
    ownerName: "S. Karim",
    ownerRole: "Operations manager",
    nextAction: "None. Outcome verified against the goods-receipt record",
    requiresReview: false,
    reviewReason: null,
    openedAt: "2026-10-19T07:30:00Z",
    updatedAt: "2026-10-22T16:10:00Z",
    impactLabel: "3-day delay; no orders affected (verified)",
    impactStatus: "verified",
    shortage: null,
    claimSummary: { ...noClaims, verified: 4 },
    affectedOrders: 0,
    dataMode: S,
  },
];
