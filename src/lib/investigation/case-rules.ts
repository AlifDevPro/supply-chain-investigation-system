import type { CaseState, Severity } from "@/lib/domain";
import type { OpenCaseReference } from "@/lib/ingestion/triage";
import type { ReferenceKey } from "@/lib/domain/signal-input";
import type { Analysis } from "./analyze";
import type { CaseSignal, ReferenceSet } from "./signals";

export const CASE_RULE_VERSION = "case-rules.v1";

export type CaseDecision =
  | { action: "create"; reason: "origin" | "operator_opened" }
  | { action: "attach"; caseId: string; reason: "related_reference" }
  | { action: "hold"; why: string }
  | { action: "skip"; why: string };

const STRONG_KEYS: ReferenceKey[] = ["purchaseOrder", "shipment", "lot"];

/**
 * Open cases whose references share a value with the signal's references, most specific match first.
 * A shared material or production order alone does not relate a signal to a case that is about a different
 * purchase order, shipment or lot.
 */
export function matchOpenCase(refs: ReferenceSet, open: readonly OpenCaseReference[]): string | null {
  const order: ReferenceKey[] = [...STRONG_KEYS, "productionOrder", "material"];
  const contradicts = (c: OpenCaseReference) =>
    STRONG_KEYS.some((k) => refs[k] && c.references[k] && refs[k] !== c.references[k]);
  for (const key of order) {
    const value = refs[key];
    if (!value) continue;
    const strong = STRONG_KEYS.includes(key);
    const hit = open.find((c) => c.references[key] === value && (strong || !contradicts(c)));
    if (hit) return hit.caseId;
  }
  return null;
}

/**
 * Rules `case-rules.v1` (docs/investigation.md):
 *  - rejected, duplicate and irrelevant signals never create or update a case;
 *  - a signal sharing a reference with an open case attaches to it (triage `related_existing`, or any
 *    relevant / high-impact signal whose references match);
 *  - `high_impact` and `relevant` signals create a case;
 *  - `uncertain` signals stay held until an operator opens an investigation.
 */
export function decideCase(
  signal: { processingStatus: string; triageOutcome: string | null; references: ReferenceSet },
  open: readonly OpenCaseReference[],
  options: { operator: boolean } = { operator: false },
): CaseDecision {
  if (signal.processingStatus === "rejected") return { action: "skip", why: "rejected" };
  if (signal.processingStatus === "duplicate") return { action: "skip", why: "duplicate" };
  if (signal.triageOutcome === "irrelevant") return { action: "skip", why: "irrelevant" };
  if (signal.triageOutcome === null) return { action: "skip", why: "not triaged" };
  const match = matchOpenCase(signal.references, open);
  if (match) return { action: "attach", caseId: match, reason: "related_reference" };
  if (options.operator) return { action: "create", reason: "operator_opened" };
  if (signal.triageOutcome === "high_impact" || signal.triageOutcome === "relevant" || signal.triageOutcome === "related_existing") {
    return { action: "create", reason: "origin" };
  }
  return { action: "hold", why: "uncertain signals wait for an operator" };
}

export interface CaseOutcome {
  title: string;
  summary: string;
  state: CaseState;
  severity: Severity;
  ownerName: string;
  ownerRole: string;
  nextAction: string;
  requiresReview: boolean;
  reviewReason: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Derives the case presentation fields from the analysis. Deterministic; never typed by hand. */
export function deriveCaseOutcome(signals: readonly CaseSignal[], analysis: Analysis): CaseOutcome {
  const origin = signals[signals.length - 1] ?? signals[0];
  const latest = signals[0];
  const { shortage, deliveryRisk, conflicts, unknowns } = analysis;
  const highImpact = signals.some((s) => s.triage?.outcome === "high_impact");
  const triageReview = signals.some((s) => s.triage?.requiresReview);
  const deficit = shortage?.deficit ?? 0;
  const late = deliveryRisk?.slackDays !== null && deliveryRisk?.slackDays !== undefined && deliveryRisk.slackDays < 0;
  const affected = deliveryRisk?.affectedOrders.length ?? 0;

  let severity: Severity = "low";
  if (deficit > 0 && late) severity = "critical";
  else if (highImpact || deficit > 0 || affected > 0) severity = "high";
  else if (analysis.reportedDelayDays !== null || signals.some((s) => s.triage?.outcome === "relevant")) severity = "medium";

  const reasons: string[] = [];
  if (triageReview) reasons.push("triage requires review");
  if (shortage && shortage.status !== "verified") reasons.push(`shortage is ${shortage.status}`);
  if (deliveryRisk && deliveryRisk.status !== "verified") reasons.push(`delivery risk is ${deliveryRisk.status}`);
  if (conflicts.length) reasons.push(`${conflicts.length} conflict(s) between sources`);
  if (unknowns.length) reasons.push(`${unknowns.length} open unknown(s)`);
  const requiresReview = reasons.length > 0;

  const parts: string[] = [];
  parts.push(`${signals.length} linked signal(s).`);
  if (deliveryRisk?.delayDays !== null && deliveryRisk?.delayDays !== undefined) {
    parts.push(`Expected arrival ${deliveryRisk.expectedArrival} (${deliveryRisk.delayDays} day(s) after the promised date, basis: ${deliveryRisk.arrivalBasis.replace("_", " ")}).`);
  } else if (analysis.reportedDelayDays !== null) {
    parts.push(`A ${analysis.reportedDelayDays}-day delay is reported.`);
  }
  if (affected > 0) parts.push(`${affected} production order(s) need the material before it arrives.`);
  if (shortage?.deficit !== null && shortage?.deficit !== undefined) {
    parts.push(`${shortage.status === "verified" ? "Verified" : "Provisional"} shortage: ${fmt(shortage.deficit)} ${shortage.unit}.`);
  } else if (shortage) {
    parts.push("The shortage cannot be calculated from the available records.");
  }
  if (conflicts.length || unknowns.length) parts.push(`${conflicts.length} conflict(s), ${unknowns.length} unknown(s).`);

  const role =
    origin?.sourceType === "quality_record"
      ? "Quality-control specialist"
      : origin?.sourceType === "inventory_balance" || origin?.sourceType === "inventory_reservation"
        ? "Inventory manager"
        : origin?.sourceType === "supplier_email" || origin?.sourceType === "erp_purchase_order" || origin?.sourceType === "shipment"
          ? "Procurement specialist"
          : "Supply-chain manager";

  const nextAction = conflicts[0]
    ? `Resolve: ${conflicts[0].description}`
    : unknowns[0]
      ? unknowns[0].suggestedRetrieval
      : "Review the calculated impact and decide on next steps.";

  return {
    title: origin?.normalized.label ?? latest?.normalized.label ?? "Investigation",
    summary: parts.join(" "),
    state: requiresReview ? "needs_review" : "investigating",
    severity,
    ownerName: "Unassigned",
    ownerRole: role,
    nextAction: nextAction.length > 300 ? `${nextAction.slice(0, 299)}…` : nextAction,
    requiresReview,
    reviewReason: requiresReview ? reasons.join("; ") : null,
  };
}
