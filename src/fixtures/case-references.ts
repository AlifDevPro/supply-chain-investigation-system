/**
 * SYNTHETIC reference index of the fixture cases, used by triage rule `related.open-case-reference`.
 * Phase 3 replaces this with a query over real investigation cases. Only open cases are listed.
 */
import type { CaseReferenceIndex, OpenCaseReference } from "@/lib/ingestion/triage";

export const fixtureOpenCaseReferences: readonly OpenCaseReference[] = [
  { caseId: "INV-2041", references: { purchaseOrder: "PO-77120", material: "NV-4471", shipment: "SHP-30871" } },
  { caseId: "INV-2043", references: { lot: "ET-2290" } },
  { caseId: "INV-2040", references: { purchaseOrder: "PO-77044" } },
  { caseId: "INV-2039", references: { material: "ZP-1180" } },
];

export const fixtureCaseReferenceIndex: CaseReferenceIndex = {
  openCases: () => fixtureOpenCaseReferences,
};
