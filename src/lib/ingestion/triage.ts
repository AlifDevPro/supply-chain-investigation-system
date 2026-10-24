import type { DedupeStatus, TriageReasonCode, TriageResult } from "@/lib/domain/processing";
import type { ReferenceKey, NormalizedSignal } from "@/lib/domain/signal-input";
import { REFERENCE_KEYS } from "@/lib/domain/signal-input";
import type { SourceType, Unit } from "@/lib/domain";

export const TRIAGE_VERSION = "triage.v1";

/** Quantity at or above which a disruption report is treated as high impact. Documented in docs/signal-ingestion.md. */
export const HIGH_IMPACT_QUANTITY: Record<Unit, number> = { m: 5000, yd: 5000, kg: 2000, pcs: 10000 };

const HIGH_IMPACT_SOURCES: readonly SourceType[] = ["supplier_email", "shipment", "erp_purchase_order", "manual_report"];

/** Read-only view of open cases for relating a signal to one. */
export interface OpenCaseReference {
  caseId: string;
  references: Partial<Record<ReferenceKey, string>>;
}
export interface CaseReferenceIndex {
  openCases(): readonly OpenCaseReference[];
}
/** Where the pipeline loads open cases from; persisted stores answer asynchronously. */
export interface CaseReferenceSource {
  openCases(): readonly OpenCaseReference[] | Promise<readonly OpenCaseReference[]>;
}

const DISRUPTION = /\b(delay(?:s|ed|ing)?|late(?:r)?|postpone(?:d|ment)?|reschedul(?:e|ed|ing)|slip(?:s|ped)?|pushed back|push back|shortage|short[- ]?shipp?(?:ed|ment)?|on hold|held up)\b/i;
const HEDGE = /\b(possible|possibly|may|might|could|unconfirmed|tentative|schedule change|potential(?:ly)?)\b/i;

function textOf(signal: NormalizedSignal): string {
  return `${signal.label} ${signal.excerpt ?? ""}`;
}

export function hasDisruptionLanguage(signal: NormalizedSignal): boolean {
  return DISRUPTION.test(textOf(signal));
}

export function hasHedgedLanguage(signal: NormalizedSignal): boolean {
  return HEDGE.test(textOf(signal));
}

function matchOpenCases(signal: NormalizedSignal, index: CaseReferenceIndex): string[] {
  const matched: string[] = [];
  for (const open of index.openCases()) {
    const hit = REFERENCE_KEYS.some((key) => {
      const mine = signal.references[key];
      const theirs = open.references[key];
      return mine !== null && theirs !== undefined && mine === theirs.toUpperCase();
    });
    if (hit) matched.push(open.caseId);
  }
  return matched;
}

function finish(
  base: Omit<TriageResult, "ruleVersion" | "reasonCodes" | "relatedCaseIds"> & {
    reasonCodes: TriageReasonCode[];
    relatedCaseIds?: string[];
  },
  dedupe: { status: DedupeStatus; possiblyRelated: string[] },
): TriageResult {
  const reasonCodes = [...base.reasonCodes];
  let requiresReview = base.requiresReview;
  if (dedupe.status === "revision") {
    reasonCodes.push("revision_of_earlier_signal");
    requiresReview = true;
  }
  if (dedupe.possiblyRelated.length > 0) reasonCodes.push("possibly_related_signal");
  return {
    outcome: base.outcome,
    ruleId: base.ruleId,
    ruleVersion: TRIAGE_VERSION,
    reasonCodes,
    requiresReview,
    relatedCaseIds: base.relatedCaseIds ?? [],
  };
}

/**
 * Ordered deterministic triage (docs/signal-ingestion.md "Triage: triage.v1"). First match wins.
 * `irrelevant` is only produced by a positive allowlist match. Anything unrecognized is `uncertain` and
 * held for review, never discarded. Free text is matched as data and cannot change the rules.
 */
export function triageSignal(
  signal: NormalizedSignal,
  dedupe: { status: DedupeStatus; possiblyRelated: string[] },
  caseIndex: CaseReferenceIndex,
): TriageResult {
  const disruption = hasDisruptionLanguage(signal);
  const hedged = hasHedgedLanguage(signal);

  if (signal.sourceType === "quality_record" && signal.attributes.inspectionResult === "failed") {
    return finish(
      { outcome: "high_impact", ruleId: "triage.v1/high-impact.quality-failed", reasonCodes: ["quality_inspection_failed"], requiresReview: true },
      dedupe,
    );
  }

  const quantity = signal.quantity;
  if (
    quantity &&
    HIGH_IMPACT_SOURCES.includes(signal.sourceType) &&
    disruption &&
    quantity.value >= HIGH_IMPACT_QUANTITY[quantity.unit]
  ) {
    return finish(
      { outcome: "high_impact", ruleId: "triage.v1/high-impact.large-quantity", reasonCodes: ["quantity_over_threshold"], requiresReview: true },
      dedupe,
    );
  }

  const related = matchOpenCases(signal, caseIndex);
  if (related.length > 0) {
    return finish(
      {
        outcome: "related_existing",
        ruleId: "triage.v1/related.open-case-reference",
        reasonCodes: ["matches_open_case_reference"],
        requiresReview: false,
        relatedCaseIds: related,
      },
      dedupe,
    );
  }

  if (
    signal.sourceType === "inventory_balance" &&
    signal.attributes.routineSync === true &&
    signal.attributes.varianceDetected === false
  ) {
    return finish(
      { outcome: "irrelevant", ruleId: "triage.v1/irrelevant.routine-sync", reasonCodes: ["routine_inventory_sync"], requiresReview: false },
      dedupe,
    );
  }

  if (disruption && !hedged && signal.references.purchaseOrder !== null) {
    return finish(
      { outcome: "relevant", ruleId: "triage.v1/relevant.delay-with-po", reasonCodes: ["delay_language_with_po"], requiresReview: false },
      dedupe,
    );
  }

  const reasons: TriageReasonCode[] = ["no_rule_matched"];
  if (!disruption) reasons.push("no_disruption_language");
  if (hedged) reasons.push("hedged_language");
  if (signal.references.purchaseOrder === null) reasons.push("no_purchase_order_reference");
  if (signal.quantity === null) reasons.push("missing_quantity");
  if (signal.attributes.routineSync === true && signal.attributes.varianceDetected === true) {
    reasons.push("conflicting_attributes");
  }
  return finish(
    { outcome: "uncertain", ruleId: "triage.v1/uncertain.default", reasonCodes: reasons, requiresReview: true },
    dedupe,
  );
}
