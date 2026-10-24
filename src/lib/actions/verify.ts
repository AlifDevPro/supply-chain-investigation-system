import { createHash } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";
import { canVerifyOutcome } from "@/lib/auth/roles";
import type { GovernanceRepository } from "@/lib/store/governance-types";
import type { InvestigationRepository, StoredCase } from "@/lib/store/investigation-types";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import { applyTransition } from "@/lib/review/transitions";
import { AuthorizationDeniedError } from "./errors";
import { actionEvent } from "./events";

export const VERIFY_OUTCOME_VERSION = "verify-outcome.v1";

export interface OutcomeCheck {
  matched: boolean;
  summary: string;
  fingerprint: string;
}

/** Stable digest of the records the approved action was about. Used to detect a later change. */
export async function relevantRecordFingerprint(
  tenantId: string,
  stored: StoredCase,
  reader: BusinessRecordReader,
): Promise<string> {
  const refs = stored.referenceKeys;
  const parts: string[] = [];
  if (refs.purchaseOrder) {
    const po = await reader.purchaseOrder(tenantId, refs.purchaseOrder);
    parts.push(`po:${po?.id ?? "missing"}:${po?.status ?? ""}:${po?.meta.recordVersion ?? 0}`);
  }
  if (refs.shipment) {
    const sh = await reader.shipment(tenantId, refs.shipment);
    parts.push(`sh:${sh?.id ?? "missing"}:${sh?.eta ?? ""}:${sh?.status ?? ""}:${sh?.meta.recordVersion ?? 0}`);
  }
  if (refs.material) {
    const inv = await reader.inventory(tenantId, refs.material);
    parts.push(`inv:${inv.map((b) => `${b.id}:${b.qualityStatus}:${b.onHand}:${b.meta.recordVersion}`).join(",")}`);
  }
  return createHash("sha256").update(parts.join("|") || "empty").digest("hex");
}

export async function checkOutcome(params: {
  tenantId: string;
  stored: StoredCase;
  reader: BusinessRecordReader;
  baselineFingerprint: string | null;
}): Promise<OutcomeCheck> {
  const fingerprint = await relevantRecordFingerprint(params.tenantId, params.stored, params.reader);
  if (!params.baselineFingerprint || params.baselineFingerprint === fingerprint) {
    return { matched: false, summary: "not verified: source records unchanged", fingerprint };
  }
  return { matched: true, summary: "Source records differ from the execution baseline.", fingerprint };
}

export async function recordOutcomeObservation(params: {
  tenantId: string;
  caseId: string;
  actionId: string | null;
  actor: SessionUser;
  markVerified: boolean;
  governance: GovernanceRepository;
  investigations: InvestigationRepository;
  reader: BusinessRecordReader;
  now: Date;
}): Promise<OutcomeCheck> {
  const detail = await params.investigations.getCase(params.tenantId, params.caseId);
  if (!detail) throw new Error("Case not found.");
  const observations = await params.governance.listObservations(params.tenantId, params.caseId);
  const baseline = observations.find((o) => o.summary.startsWith("baseline:"));
  const baselineFingerprint = baseline ? baseline.summary.slice("baseline:".length) : null;
  const check = await checkOutcome({
    tenantId: params.tenantId,
    stored: detail.case,
    reader: params.reader,
    baselineFingerprint,
  });
  const now = params.now.toISOString();
  await params.governance.insertObservation({
    tenantId: params.tenantId,
    id: `${params.caseId}-OBS-${params.now.getTime()}`,
    caseId: params.caseId,
    actionId: params.actionId,
    summary: check.summary,
    matched: check.matched,
    actorUserId: params.actor.userId,
    at: now,
    dataMode: "synthetic",
  });
  if (!params.markVerified) return check;
  if (!canVerifyOutcome(params.actor.role)) {
    throw new AuthorizationDeniedError("Only a manager can record a verified outcome.");
  }
  if (!check.matched) {
    throw new AuthorizationDeniedError("The independent check did not find a matching change.");
  }
  await params.investigations.transaction(async (tx) => {
    if (detail.case.state === "awaiting_verification") {
      await tx.updateCase(applyTransition(detail.case, "resolved", "Outcome verified against source records.", now));
    }
    await tx.insertEvents(params.tenantId, [
      actionEvent({
        type: "outcome.verified",
        stage: "verified",
        caseId: params.caseId,
        occurredAt: now,
        methodName: VERIFY_OUTCOME_VERSION,
        metadata: {
          actor: params.actor.displayName,
          actorUserId: params.actor.userId,
          matched: true,
          summary: check.summary.slice(0, 120),
        },
      }),
    ]);
  });
  if (params.actionId) {
    const action = await params.governance.getAction(params.tenantId, params.actionId);
    if (action) await params.governance.upsertAction({ ...action, status: "outcome_verified", updatedAt: now });
  }
  return check;
}
