import type { Signal, SignalRecord } from "@/lib/domain";

/**
 * Presents a Phase 1 fixture signal in the Phase 2 read model. Fields the fixtures never recorded stay
 * null ("not recorded") instead of being invented. A fixture is held for review only when its triage outcome
 * is one the Phase 2 rules always hold.
 */
export function signalToRecord(signal: Signal): SignalRecord {
  const held = signal.triageOutcome === "uncertain" || signal.triageOutcome === "high_impact";
  return {
    id: signal.id,
    correlationId: signal.correlationId,
    receivedAt: signal.receivedAt,
    sourceType: signal.sourceType,
    sourceSystem: signal.sourceSystem,
    label: signal.label,
    processingStatus: held ? "held_for_review" : "triaged",
    dedupeStatus: null,
    duplicateOf: null,
    revisionOf: null,
    triageOutcome: signal.triageOutcome,
    reasonCodes: [],
    requiresReview: held,
    ruleVersion: null,
    caseId: signal.caseId,
    dataMode: signal.dataMode,
  };
}
