import type { SessionUser } from "@/lib/auth/session";
import { canReview } from "@/lib/auth/roles";
import type { CaseState } from "@/lib/domain";
import type { GovernanceRepository, ReviewDecisionKind } from "@/lib/store/governance-types";
import type { InvestigationRepository } from "@/lib/store/investigation-types";
import { applyTransition } from "./transitions";
import { AuthorizationDeniedError } from "@/lib/actions/errors";
import { actionEvent } from "@/lib/actions/events";

const NEXT_ACTION: Record<ReviewDecisionKind, string> = {
  acknowledge: "Acknowledged; no further action.",
  request_evidence: "Waiting for additional evidence.",
  dismiss: "Dismissed.",
  reject: "Review rejected.",
};

/** Target state for a decision, or null when the decision must be refused for this case state. */
export function reviewTarget(from: CaseState, decision: ReviewDecisionKind): CaseState | null {
  if (from === "needs_review") {
    if (decision === "acknowledge") return "resolved";
    if (decision === "request_evidence") return "blocked";
    if (decision === "dismiss") return "dismissed";
    return "rejected";
  }
  if (from === "awaiting_approval") {
    if (decision === "reject") return "rejected";
    if (decision === "request_evidence") return "needs_review";
    return null;
  }
  return null;
}

export async function recordReviewDecision(params: {
  tenantId: string;
  caseId?: string;
  signalId?: string;
  decision: ReviewDecisionKind;
  rationale: string;
  actor: SessionUser;
  governance: GovernanceRepository;
  investigations: InvestigationRepository;
  now: Date;
}): Promise<void> {
  if (!canReview(params.actor.role)) throw new AuthorizationDeniedError();
  if (!params.caseId && !params.signalId) throw new Error("A case or signal is required.");
  const detail = params.caseId ? await params.investigations.getCase(params.tenantId, params.caseId) : null;
  if (params.caseId && !detail) throw new AuthorizationDeniedError("Not found for this tenant.");
  const target = detail ? reviewTarget(detail.case.state, params.decision) : null;
  if (detail && !target) {
    throw new AuthorizationDeniedError(
      params.decision === "acknowledge"
        ? "Acknowledge cannot resolve a case that is awaiting approval of a proposed action."
        : "Dismiss is not available while a proposed action is awaiting approval. Reject the action instead.",
    );
  }
  const now = params.now.toISOString();
  const id = `RD-${params.now.getTime()}`;
  await params.governance.insertDecision({
    tenantId: params.tenantId,
    id,
    caseId: params.caseId ?? null,
    signalId: params.signalId ?? null,
    decision: params.decision,
    rationale: params.rationale.slice(0, 600),
    actorUserId: params.actor.userId,
    at: now,
    dataMode: "synthetic",
  });
  if (!detail || !target) return;
  await params.investigations.transaction(async (tx) => {
    await tx.updateCase(applyTransition(detail.case, target, NEXT_ACTION[params.decision], now));
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "review.completed",
        stage: "review",
        caseId: params.caseId!,
        occurredAt: now,
        methodName: "review.v1",
        metadata: {
          actor: params.actor.displayName,
          actorUserId: params.actor.userId,
          decision: params.decision,
        },
      }),
    ]);
  });
}
