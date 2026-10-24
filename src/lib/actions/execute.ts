import type { SessionUser } from "@/lib/auth/session";
import { canApprove } from "@/lib/auth/roles";
import type { GovernanceRepository, StoredProposedAction } from "@/lib/store/governance-types";
import type { InvestigationRepository } from "@/lib/store/investigation-types";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import { applyTransition } from "@/lib/review/transitions";
import { UniqueViolationError } from "@/lib/store/types";
import { ActionNotFoundError, AuthorizationDeniedError, StaleApprovalError } from "./errors";
import { actionEvent } from "./events";
import { relevantRecordFingerprint } from "./verify";

export const SYNTHETIC_ADAPTER = "synthetic.v1";

/**
 * Records a synthetic execution. Never sends mail, never calls HTTP, never UPDATEs business tables.
 * Idempotent on (tenant, action_id, version).
 */
export async function executeSynthetic(params: {
  tenantId: string;
  actionId: string;
  version: number;
  actor: SessionUser;
  governance: GovernanceRepository;
  investigations: InvestigationRepository;
  reader: BusinessRecordReader;
  now: Date;
}): Promise<StoredProposedAction> {
  const action = await params.governance.getAction(params.tenantId, params.actionId);
  if (!action) throw new ActionNotFoundError(params.actionId);
  if (!canApprove(params.actor.role, action.requiredRole)) {
    throw new AuthorizationDeniedError("This role cannot execute that proposed action.");
  }
  if (action.version !== params.version) throw new StaleApprovalError();
  if (action.status !== "approved" && action.status !== "executing" && action.status !== "executed") {
    throw new StaleApprovalError("Approve the current version before executing.");
  }
  const key = `${params.tenantId}:${action.id}:${action.version}`;
  const existing = await params.governance.getExecutionByKey(params.tenantId, key);
  if (existing && existing.status === "completed") {
    return action.status === "executed" ? action : { ...action, status: "executed" };
  }
  const startedAt = params.now.toISOString();
  const detail = await params.investigations.getCase(params.tenantId, action.caseId);
  await params.investigations.transaction(async (tx) => {
    if (detail && detail.case.state === "approved") {
      await tx.updateCase(applyTransition(detail.case, "executing", "Synthetic execution in progress.", startedAt));
    }
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "action.execution_started",
        stage: "action",
        caseId: action.caseId,
        occurredAt: startedAt,
        methodName: SYNTHETIC_ADAPTER,
        metadata: { actor: params.actor.displayName, actionId: action.id, adapter: SYNTHETIC_ADAPTER, sent: false },
      }),
    ]);
  });
  try {
    await params.governance.insertExecution({
      tenantId: params.tenantId,
      id: `${action.id}-EX-${action.version}-C`,
      actionId: action.id,
      actionVersion: action.version,
      adapter: SYNTHETIC_ADAPTER,
      status: "completed",
      sent: false,
      reason: "no connector",
      idempotencyKey: key,
      actorUserId: params.actor.userId,
      at: startedAt,
      dataMode: "synthetic",
    });
  } catch (error) {
    if (!(error instanceof UniqueViolationError)) throw error;
  }
  const finishedAt = new Date(params.now.getTime() + 1).toISOString();
  const updated: StoredProposedAction = { ...action, status: "executed", updatedAt: finishedAt };
  await params.governance.upsertAction(updated);
  const after = await params.investigations.getCase(params.tenantId, action.caseId);
  let current = after?.case;
  if (current?.state === "approved") current = applyTransition(current, "executing", "Synthetic execution in progress.", finishedAt);
  if (current?.state === "executing") {
    current = applyTransition(current, "awaiting_verification", "Execution recorded. Outcome is not verified.", finishedAt);
  }
  const fingerprint = after ? await relevantRecordFingerprint(params.tenantId, after.case, params.reader) : "empty";
  await params.governance.insertObservation({
    tenantId: params.tenantId,
    id: `${action.id}-BASE-${action.version}`,
    caseId: action.caseId,
    actionId: action.id,
    summary: `baseline:${fingerprint}`,
    matched: false,
    actorUserId: params.actor.userId,
    at: finishedAt,
    dataMode: "synthetic",
  });
  await params.investigations.transaction(async (tx) => {
    if (current && after && current.state !== after.case.state) await tx.updateCase(current);
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "action.execution_completed",
        stage: "action",
        caseId: action.caseId,
        occurredAt: finishedAt,
        durationMs: 1,
        methodName: SYNTHETIC_ADAPTER,
        metadata: {
          actor: params.actor.displayName,
          actionId: action.id,
          adapter: SYNTHETIC_ADAPTER,
          sent: false,
          reason: "no connector",
        },
      }),
    ]);
  });
  return updated;
}
