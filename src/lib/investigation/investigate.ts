import { analyzeCase, INVESTIGATION_RULE_VERSION, type Analysis } from "./analyze";
import { CASE_RULE_VERSION, deriveCaseOutcome, type CaseOutcome } from "./case-rules";
import { BoundedReader, type BusinessRecordReader, type RetrievalAccounting } from "./reader";
import { retrieveEvidence, type Retrieved } from "./retrieve";
import { mergeReferences, type CaseSignal } from "./signals";
import { SHORTAGE_RULE_VERSION } from "@/lib/impact/shortage";
import { DELIVERY_RISK_RULE_VERSION } from "@/lib/impact/delivery-risk";

export const RULE_VERSIONS = {
  investigation: INVESTIGATION_RULE_VERSION,
  caseRules: CASE_RULE_VERSION,
  shortage: SHORTAGE_RULE_VERSION,
  deliveryRisk: DELIVERY_RISK_RULE_VERSION,
  delayLength: "delay-length.v1",
  proposeActions: "propose-actions.v1",
  transitions: "transitions.v1",
  verifyOutcome: "verify-outcome.v1",
} as const;

export interface InvestigationResult {
  retrieved: Retrieved;
  accounting: RetrievalAccounting;
  analysis: Analysis;
  outcome: CaseOutcome;
  retrievalMs: number;
  analysisMs: number;
}

/**
 * Retrieval + analysis for one case, without persistence. `signals` must be newest first.
 * Reader failures propagate; the caller records them as a failed run.
 */
export async function investigateSignals(params: {
  tenantId: string;
  caseId: string;
  runId: string;
  signals: readonly CaseSignal[];
  reader: BusinessRecordReader;
  now: Date;
  monotonicMs: () => number;
}): Promise<InvestigationResult> {
  const bounded = new BoundedReader(params.reader, params.tenantId);
  const t0 = params.monotonicMs();
  const retrieved = await retrieveEvidence(mergeReferences(params.signals), bounded, params.now.toISOString().slice(0, 10));
  const t1 = params.monotonicMs();
  const analysis = analyzeCase({ runId: params.runId, caseId: params.caseId, signals: params.signals, retrieved, now: params.now });
  const outcome = deriveCaseOutcome(params.signals, analysis);
  const t2 = params.monotonicMs();
  return {
    retrieved,
    accounting: bounded.accounting(),
    analysis,
    outcome,
    retrievalMs: Math.max(0, t1 - t0),
    analysisMs: Math.max(0, t2 - t1),
  };
}
