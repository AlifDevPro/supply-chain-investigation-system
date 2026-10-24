import type { Role } from "@/lib/auth/roles";
import type { Conflict, UnknownItem } from "@/lib/domain";
import type { StoredCase } from "@/lib/store/investigation-types";
import type { GovernanceRepository, StoredProposedAction } from "@/lib/store/governance-types";
import { applyTransition } from "@/lib/review/transitions";
import { parameterDigest } from "./digest";

export const PROPOSE_ACTIONS_VERSION = "propose-actions.v1";

export interface ActionDraft {
  id: string;
  title: string;
  parameters: Array<{ label: string; value: string }>;
  rationale: string;
  requiredRole: Role;
}

const DATE_CONFLICT = /delay|ship|promised|eta|arrival|date/i;
const QC_UNKNOWN = /quality|reservation/i;

function param(label: string, value: string | undefined | null): { label: string; value: string } | null {
  if (!value) return null;
  return { label, value };
}

/**
 * Deterministic action suggestions from the latest analysis only. Origin is always `rule_suggested`.
 * AI extraction cannot originate an approvable action.
 */
export function proposeActions(input: {
  caseId: string;
  referenceKeys: Record<string, string | undefined>;
  conflicts: readonly Conflict[];
  unknowns: readonly UnknownItem[];
}): ActionDraft[] {
  const refs = input.referenceKeys;
  const drafts: ActionDraft[] = [];
  const dateConflict = input.conflicts.find((c) => DATE_CONFLICT.test(c.description));
  if (dateConflict) {
    const parameters = [
      param("Purchase order", refs.purchaseOrder),
      param("Material", refs.material),
      param("Shipment", refs.shipment),
    ].filter((p): p is { label: string; value: string } => p !== null);
    if (parameters.length === 0) parameters.push({ label: "Case", value: input.caseId });
    drafts.push({
      id: `${input.caseId}-ASK-DATE`,
      title: "Ask supplier to confirm revised ship date",
      parameters,
      rationale: dateConflict.description,
      requiredRole: "procurement",
    });
  }
  const qcUnknown = input.unknowns.find((u) => QC_UNKNOWN.test(u.description) || QC_UNKNOWN.test(u.suggestedRetrieval));
  if (qcUnknown) {
    const parameters = [
      param("Material", refs.material),
      param("Production order", refs.productionOrder),
      param("Lot", refs.lot),
    ].filter((p): p is { label: string; value: string } => p !== null);
    if (parameters.length === 0) parameters.push({ label: "Case", value: input.caseId });
    drafts.push({
      id: `${input.caseId}-RETRIEVE-QC`,
      title: "Retrieve quality-release / reservation records",
      parameters,
      rationale: qcUnknown.description,
      requiredRole: "reviewer",
    });
  }
  return drafts;
}

export async function syncProposedActions(params: {
  tenantId: string;
  stored: StoredCase;
  conflicts: readonly Conflict[];
  unknowns: readonly UnknownItem[];
  governance: GovernanceRepository;
  updateCase: (c: StoredCase) => Promise<void>;
  now: Date;
}): Promise<StoredProposedAction[]> {
  const drafts = proposeActions({
    caseId: params.stored.id,
    referenceKeys: params.stored.referenceKeys,
    conflicts: params.conflicts,
    unknowns: params.unknowns,
  });
  const now = params.now.toISOString();
  const rows: StoredProposedAction[] = [];
  for (const draft of drafts) {
    const digest = parameterDigest(draft.parameters);
    const existing = await params.governance.getAction(params.tenantId, draft.id);
    const terminal = existing && (existing.status === "executed" || existing.status === "outcome_verified" || existing.status === "failed");
    if (existing && existing.parameterDigest === digest) {
      rows.push(existing);
      continue;
    }
    if (terminal && existing) {
      rows.push(existing);
      continue;
    }
    const version = existing ? existing.version + 1 : 1;
    const status = draft.requiredRole === "reviewer" ? "proposed" : "awaiting_approval";
    const row: StoredProposedAction = {
      tenantId: params.tenantId,
      id: draft.id,
      caseId: params.stored.id,
      title: draft.title,
      parameters: draft.parameters,
      parameterDigest: digest,
      rationale: draft.rationale,
      origin: "rule_suggested",
      status,
      version,
      requiredRole: draft.requiredRole,
      updatedAt: now,
      dataMode: "synthetic",
    };
    await params.governance.upsertAction(row);
    rows.push(row);
  }
  const needsProcurement = rows.some((r) => r.requiredRole === "procurement" && (r.status === "proposed" || r.status === "awaiting_approval"));
  if (needsProcurement && params.stored.state === "needs_review") {
    await params.updateCase(applyTransition(params.stored, "awaiting_approval", "Approve the proposed supplier confirmation.", now));
  }
  return rows;
}
