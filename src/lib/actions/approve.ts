import type { SessionUser } from "@/lib/auth/session";
import { canApprove } from "@/lib/auth/roles";
import type { GovernanceRepository, StoredProposedAction } from "@/lib/store/governance-types";
import type { InvestigationRepository } from "@/lib/store/investigation-types";
import { applyTransition } from "@/lib/review/transitions";
import { ActionNotFoundError, AuthorizationDeniedError, StaleApprovalError } from "./errors";
import { actionEvent } from "./events";

export interface ApproveInput {
  actionId: string;
  version: number;
  digest: string;
}

export async function approveAction(params: {
  tenantId: string;
  input: ApproveInput;
  actor: SessionUser;
  governance: GovernanceRepository;
  investigations: InvestigationRepository;
  now: Date;
}): Promise<StoredProposedAction> {
  const action = await params.governance.getAction(params.tenantId, params.input.actionId);
  if (!action || action.tenantId !== params.tenantId) throw new ActionNotFoundError(params.input.actionId);
  if (!canApprove(params.actor.role, action.requiredRole)) {
    throw new AuthorizationDeniedError("This role cannot approve that proposed action.");
  }
  if (action.version !== params.input.version || action.parameterDigest !== params.input.digest) {
    throw new StaleApprovalError();
  }
  if (action.status === "approved" || action.status === "executing" || action.status === "executed" || action.status === "outcome_verified") {
    return action;
  }
  if (action.status !== "proposed" && action.status !== "awaiting_approval") {
    throw new StaleApprovalError("This action is not awaiting approval.");
  }
  const now = params.now.toISOString();
  const approvals = await params.governance.listApprovals(params.tenantId, action.id);
  const existing = approvals.find((a) => a.approvedVersion === action.version && a.parameterDigest === action.parameterDigest);
  if (!existing) {
    await params.governance.insertApproval({
      tenantId: params.tenantId,
      id: `${action.id}-APR-${action.version}`,
      actionId: action.id,
      approvedVersion: action.version,
      parameterDigest: action.parameterDigest,
      actorUserId: params.actor.userId,
      at: now,
      dataMode: "synthetic",
    });
  }
  const updated: StoredProposedAction = { ...action, status: "approved", updatedAt: now };
  await params.governance.upsertAction(updated);
  const detail = await params.investigations.getCase(params.tenantId, action.caseId);
  await params.investigations.transaction(async (tx) => {
    if (detail && (detail.case.state === "awaiting_approval" || detail.case.state === "needs_review")) {
      await tx.updateCase(applyTransition(detail.case, "approved", "Execute the approved action.", now));
    }
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "action.approved",
        stage: "review",
        caseId: action.caseId,
        occurredAt: now,
        methodName: "approval.v1",
        metadata: {
          actor: params.actor.displayName,
          actorUserId: params.actor.userId,
          actionId: action.id,
          version: action.version,
          digest: action.parameterDigest,
          role: params.actor.role,
        },
      }),
    ]);
  });
  return updated;
}

export async function rejectAction(params: {
  tenantId: string;
  actionId: string;
  version: number;
  digest: string;
  rationale: string;
  actor: SessionUser;
  governance: GovernanceRepository;
  investigations: InvestigationRepository;
  now: Date;
}): Promise<StoredProposedAction> {
  const action = await params.governance.getAction(params.tenantId, params.actionId);
  if (!action) throw new ActionNotFoundError(params.actionId);
  if (!canApprove(params.actor.role, action.requiredRole)) {
    throw new AuthorizationDeniedError("This role cannot reject that proposed action.");
  }
  if (action.version !== params.version || action.parameterDigest !== params.digest) throw new StaleApprovalError();
  const now = params.now.toISOString();
  const updated: StoredProposedAction = { ...action, status: "rejected", updatedAt: now };
  await params.governance.upsertAction(updated);
  const detail = await params.investigations.getCase(params.tenantId, action.caseId);
  await params.investigations.transaction(async (tx) => {
    if (detail?.case.state === "awaiting_approval") {
      await tx.updateCase(applyTransition(detail.case, "needs_review", "The proposed action was rejected.", now));
    }
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "review.completed",
        stage: "review",
        caseId: action.caseId,
        occurredAt: now,
        methodName: "approval.v1",
        metadata: {
          actor: params.actor.displayName,
          actorUserId: params.actor.userId,
          actionId: action.id,
          decision: "reject",
          rationale: params.rationale.slice(0, 120),
        },
      }),
    ]);
  });
  return updated;
}
