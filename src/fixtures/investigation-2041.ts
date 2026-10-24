/**
 * SYNTHETIC DATA. Illustrates the README example investigation (supplier delay of navy fabric).
 * Names, IDs, quantities and dates are invented for development and do not describe a real factory.
 */
import type {
  AuditEntry,
  Claim,
  Conflict,
  EntityEdge,
  EntityNode,
  EvidenceItem,
  ProposedAction,
  Signal,
  UnknownItem,
} from "@/lib/domain";
import { calculateProvisionalShortage } from "@/lib/impact/shortage";

const CASE = "INV-2041";
const S = "synthetic" as const;

export const signal2041: Signal = {
  id: "SIG-8841",
  sourceType: "supplier_email",
  sourceSystem: "Mailbox: procurement@ (synthetic)",
  label: "Supplier notice: navy twill NV-4471 delayed",
  receivedAt: "2026-10-23T09:42:10Z",
  triageOutcome: "relevant",
  caseId: CASE,
  correlationId: "corr-8841",
  dataMode: S,
};

export const evidence2041: EvidenceItem[] = [
  {
    id: "EV-2041-01",
    caseId: CASE,
    sourceSystem: "Mailbox: procurement@ (synthetic)",
    sourceRecordId: "MSG-20261023-0931",
    sourceType: "supplier_email",
    title: "Supplier delay notice from Hartwell Textile Mills",
    excerpt:
      "\"...the 8,000 m of Navy Twill NV-4471 under PO-77120 will ship approximately four days later than planned.\"",
    fieldLocation: "Message body, paragraph 2",
    observedAt: "2026-10-23T09:42:10Z",
    sourceReportedAt: "2026-10-23T09:30:00Z",
    recordVersion: "v1",
    extractionMethod: "deterministic_rule",
    verificationStatus: "reported",
    dataMode: S,
  },
  {
    id: "EV-2041-02",
    caseId: CASE,
    sourceSystem: "ERP (synthetic)",
    sourceRecordId: "PO-77120",
    sourceType: "erp_purchase_order",
    title: "Purchase order PO-77120",
    excerpt: "Item NV-4471 Navy Twill, 8,000 m, supplier Hartwell Textile Mills, promised date 2026-10-26, status OPEN.",
    fieldLocation: "Header; line 1",
    observedAt: "2026-10-23T09:42:12Z",
    sourceReportedAt: null,
    recordVersion: "rev 4 (2026-10-14)",
    extractionMethod: "system_record",
    verificationStatus: "verified",
    dataMode: S,
  },
  {
    id: "EV-2041-03",
    caseId: CASE,
    sourceSystem: "Production planning (synthetic)",
    sourceRecordId: "PRD-5530",
    sourceType: "production_order",
    title: "Production order PRD-5530",
    excerpt: "Requires 6,000 m of NV-4471 at Plant 2. Material needed by Friday 2026-10-30.",
    fieldLocation: "Component line 3; header: need-by date",
    observedAt: "2026-10-23T09:42:13Z",
    sourceReportedAt: null,
    recordVersion: "rev 2 (2026-10-12)",
    extractionMethod: "system_record",
    verificationStatus: "stale",
    dataMode: S,
  },
  {
    id: "EV-2041-04",
    caseId: CASE,
    sourceSystem: "Inventory (synthetic)",
    sourceRecordId: "BAL-9012",
    sourceType: "inventory_balance",
    title: "Inventory balance, Plant 2 warehouse W2",
    excerpt: "NV-4471 Navy Twill: 500 m on hand. No reservation or quality fields present in this record.",
    fieldLocation: "Balance row; fields reserved_qty and qc_status are empty",
    observedAt: "2026-10-23T09:42:13Z",
    sourceReportedAt: null,
    recordVersion: "snapshot 2026-10-23 06:00",
    extractionMethod: "system_record",
    verificationStatus: "reported",
    dataMode: S,
  },
  {
    id: "EV-2041-05",
    caseId: CASE,
    sourceSystem: "Carrier tracking (synthetic)",
    sourceRecordId: "SHP-30871",
    sourceType: "shipment",
    title: "Shipment SHP-30871 tracking",
    excerpt: "Status: in transit. Carrier-estimated arrival at Plant 2: 2026-10-27. Last scan 2026-10-23 05:15.",
    fieldLocation: "Latest status event; eta_date",
    observedAt: "2026-10-23T09:42:14Z",
    sourceReportedAt: "2026-10-23T05:15:00Z",
    recordVersion: "event 7",
    extractionMethod: "system_record",
    verificationStatus: "reported",
    dataMode: S,
  },
];

export const claims2041: Claim[] = [
  {
    id: "CL-2041-01",
    caseId: CASE,
    statement: "Supplier reports that the 8,000 m of NV-4471 will ship about four days late.",
    state: "reported",
    basis: "Stated in a supplier message. Not yet confirmed by the shipment record.",
    evidenceIds: ["EV-2041-01"],
    dataMode: S,
  },
  {
    id: "CL-2041-02",
    caseId: CASE,
    statement: "PO-77120 covers 8,000 m of NV-4471, originally promised for 26 Oct.",
    state: "verified",
    basis: "Authoritative ERP purchase order, current revision.",
    evidenceIds: ["EV-2041-02"],
    dataMode: S,
  },
  {
    id: "CL-2041-03",
    caseId: CASE,
    statement: "PRD-5530 needs 6,000 m of NV-4471 by Friday 30 Oct.",
    state: "stale",
    basis: "Production order was last revised on 12 Oct; the requirement and deadline may have changed.",
    evidenceIds: ["EV-2041-03"],
    dataMode: S,
  },
  {
    id: "CL-2041-04",
    caseId: CASE,
    statement: "500 m of NV-4471 is on hand at Plant 2 warehouse W2.",
    state: "reported",
    basis: "Inventory balance row; reservation and quality fields are empty, so usability is not established.",
    evidenceIds: ["EV-2041-04"],
    dataMode: S,
  },
  {
    id: "CL-2041-05",
    caseId: CASE,
    statement: "The delayed PO-77120 is the supply intended for PRD-5530.",
    state: "inferred",
    basis: "Same material and plant. No explicit allocation link between PO-77120 and PRD-5530 was found.",
    evidenceIds: ["EV-2041-02", "EV-2041-03"],
    dataMode: S,
  },
  {
    id: "CL-2041-06",
    caseId: CASE,
    statement: "The 500 m on hand can be used for PRD-5530.",
    state: "assumed",
    basis: "Accepted temporarily so a provisional deficit can be shown. Reservations and quality status are unverified.",
    evidenceIds: ["EV-2041-04"],
    dataMode: S,
  },
  {
    id: "CL-2041-07",
    caseId: CASE,
    statement: "The shipment will arrive on 30 Oct (supplier) or 27 Oct (carrier).",
    state: "conflicted",
    basis: "The supplier message and the carrier tracking record disagree on the arrival date.",
    evidenceIds: ["EV-2041-01", "EV-2041-05"],
    dataMode: S,
  },
];

export const unknowns2041: UnknownItem[] = [
  {
    id: "UN-2041-01",
    caseId: CASE,
    description: "Whether any of the 500 m on hand is reserved for another production order.",
    whyItMatters: "Reserved stock cannot cover PRD-5530, which would increase the deficit.",
    suggestedRetrieval: "Retrieve inventory reservation records for NV-4471 at Plant 2.",
    dataMode: S,
  },
  {
    id: "UN-2041-02",
    caseId: CASE,
    description: "Quality-release status of the 500 m on hand.",
    whyItMatters: "Stock on quality hold is not usable and would increase the deficit.",
    suggestedRetrieval: "Search quality records for NV-4471 lots in warehouse W2.",
    dataMode: S,
  },
  {
    id: "UN-2041-03",
    caseId: CASE,
    description: "Whether other purchase orders or suppliers can cover NV-4471 before 30 Oct.",
    whyItMatters: "Alternative supply could reduce or remove the deficit. The retrieved scope covered PO-77120 only, so absence of other supply is not established.",
    suggestedRetrieval: "Query open purchase orders and approved suppliers for NV-4471.",
    dataMode: S,
  },
  {
    id: "UN-2041-04",
    caseId: CASE,
    description: "Whether PRD-5530 still needs 6,000 m by 30 Oct.",
    whyItMatters: "The production order record is 12 days old. A changed quantity or date changes the deficit.",
    suggestedRetrieval: "Re-read PRD-5530 and confirm with the production planner.",
    dataMode: S,
  },
];

export const conflicts2041: Conflict[] = [
  {
    id: "CF-2041-01",
    caseId: CASE,
    description: "Expected arrival date of the delayed shipment differs between sources.",
    sides: [
      { evidenceId: "EV-2041-01", sourceLabel: "Supplier message (reported)", reportedValue: "Ships ~4 days later than 26 Oct, so about 30 Oct" },
      { evidenceId: "EV-2041-05", sourceLabel: "Carrier tracking (reported)", reportedValue: "Estimated arrival 27 Oct" },
    ],
    dataMode: S,
  },
];

export const entityNodes2041: EntityNode[] = [
  { id: "N-sup", kind: "supplier", label: "Hartwell Textile Mills", detail: "Supplier (synthetic)", evidenceId: "EV-2041-01" },
  { id: "N-po", kind: "purchase_order", label: "PO-77120", detail: "8,000 m, promised 26 Oct", evidenceId: "EV-2041-02" },
  { id: "N-mat", kind: "material", label: "NV-4471 Navy Twill", detail: "Fabric, metres", evidenceId: "EV-2041-02" },
  { id: "N-prd", kind: "production_order", label: "PRD-5530", detail: "Needs 6,000 m by 30 Oct", evidenceId: "EV-2041-03" },
  { id: "N-fac", kind: "factory", label: "Plant 2", detail: "Warehouse W2", evidenceId: "EV-2041-04" },
  { id: "N-shp", kind: "shipment", label: "SHP-30871", detail: "In transit, carrier ETA 27 Oct", evidenceId: "EV-2041-05" },
];

export const entityEdges2041: EntityEdge[] = [
  { from: "N-sup", to: "N-po", relationship: "verified", basis: "Supplier field on PO-77120" },
  { from: "N-po", to: "N-mat", relationship: "verified", basis: "Line 1 item code on PO-77120" },
  { from: "N-mat", to: "N-prd", relationship: "verified", basis: "Component line 3 on PRD-5530" },
  { from: "N-prd", to: "N-fac", relationship: "verified", basis: "Plant field on PRD-5530" },
  { from: "N-fac", to: "N-shp", relationship: "inferred", basis: "Shipment destination matches Plant 2; no explicit PO link on the tracking record" },
];

export const actions2041: ProposedAction[] = [
  {
    id: "ACT-2041-01",
    caseId: CASE,
    title: "Ask supplier to confirm the revised ship date for PO-77120",
    parameters: [
      { label: "Recipient", value: "Hartwell Textile Mills, sales contact" },
      { label: "Purchase order", value: "PO-77120" },
      { label: "Question", value: "Confirm the revised ship date and the quantity per shipment" },
    ],
    rationale: "The supplier message and the carrier ETA disagree. A written confirmation resolves the conflict. Sends an external message, so it needs approval.",
    origin: "ai_suggested",
    status: "awaiting_approval",
    version: 1,
    requiredRole: "Procurement specialist",
    dataMode: S,
  },
  {
    id: "ACT-2041-02",
    caseId: CASE,
    title: "Retrieve reservation and quality-release records for NV-4471 at Plant 2",
    parameters: [
      { label: "Material", value: "NV-4471 Navy Twill" },
      { label: "Location", value: "Plant 2, warehouse W2" },
      { label: "Records", value: "Inventory reservations; quality records" },
    ],
    rationale: "Closes unknowns UN-2041-01 and UN-2041-02 so the deficit can move from provisional toward verified. Read-only retrieval.",
    origin: "rule_suggested",
    status: "proposed",
    version: 1,
    requiredRole: "Inventory or warehouse manager",
    dataMode: S,
  },
];

export const audit2041: AuditEntry[] = [
  { id: "AU-2041-1", caseId: CASE, at: "2026-10-23T09:42:10Z", actor: "System", action: "Signal received", detail: "SIG-8841 recorded from the procurement mailbox.", dataMode: S },
  { id: "AU-2041-2", caseId: CASE, at: "2026-10-23T09:42:11Z", actor: "Triage rules v1", action: "Triaged as relevant", detail: "Supplier delay language and a known purchase-order reference were detected.", dataMode: S },
  { id: "AU-2041-3", caseId: CASE, at: "2026-10-23T09:42:15Z", actor: "Impact engine shortage.v1", action: "Provisional impact calculated", detail: "Deficit shown as provisional. Reservations and quality status are missing.", dataMode: S },
  { id: "AU-2041-4", caseId: CASE, at: "2026-10-23T09:42:16Z", actor: "System", action: "Investigation created", detail: "INV-2041 opened with 5 evidence items.", dataMode: S },
  { id: "AU-2041-5", caseId: CASE, at: "2026-10-23T09:42:16Z", actor: "System", action: "Review requested", detail: "Conflicting arrival dates and a stale production order require human review.", dataMode: S },
];

/** Computed by the deterministic function, not typed by hand. */
export const impact2041 = calculateProvisionalShortage({
  required: {
    id: "in-required",
    label: "Production requirement (PRD-5530)",
    value: 6000,
    unit: "m",
    state: "stale",
    evidenceId: "EV-2041-03",
  },
  onHand: {
    id: "in-onhand",
    label: "On-hand stock (BAL-9012)",
    value: 500,
    unit: "m",
    state: "reported",
    evidenceId: "EV-2041-04",
  },
  reserved: null,
  quality: { released: null, state: "unknown", evidenceId: null },
  targetUnit: "m",
  calculatedAt: "2026-10-23T09:42:15Z",
});
