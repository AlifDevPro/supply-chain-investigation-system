import { STAGE_LABELS, type EventStatus, type EventType, type InvestigationEvent } from "@/lib/domain";

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  type: EventType;
  action: string;
  target: string;
  caseId: string | null;
  signalId: string | null;
  outcome: EventStatus;
  errorClass: string | null;
}

const TYPE_ACTION: Partial<Record<EventType, string>> = {
  "signal.received": "Signal received",
  "signal.validated": "Signal validated",
  "signal.deduplicated": "Signal deduplicated",
  "triage.completed": "Triage completed",
  "signal.held_for_review": "Signal held for review",
  "evidence.retrieved": "Evidence retrieved",
  "extraction.completed": "AI extraction completed",
  "extraction.failed": "AI extraction failed",
  "impact.calculated": "Impact calculated",
  "investigation.created": "Investigation created",
  "investigation.updated": "Investigation updated",
  "investigation.needs_review": "Review requested",
  "review.completed": "Review completed",
  "action.approved": "Action approved",
  "action.execution_started": "Action execution started",
  "action.execution_completed": "Action execution completed",
  "action.execution_failed": "Action execution failed",
  "outcome.verified": "Outcome verified",
};

function actorOf(e: InvestigationEvent): string {
  const raw = e.metadata.actor;
  return typeof raw === "string" && raw.trim() ? raw : "system";
}

function targetOf(e: InvestigationEvent): string {
  if (e.caseId && e.signalId) return `${e.caseId} · ${e.signalId}`;
  return e.caseId ?? e.signalId ?? e.correlationId;
}

/** Audit trail from append-only events. Newest first. Nothing is added that an event does not record. */
export function auditTrail(events: readonly InvestigationEvent[]): AuditRow[] {
  return [...events]
    .sort((a, b) => {
      const t = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      return t !== 0 ? t : b.sequence - a.sequence;
    })
    .map((e) => ({
      id: e.id,
      at: e.occurredAt,
      actor: actorOf(e),
      type: e.type,
      action: TYPE_ACTION[e.type] ?? `${STAGE_LABELS[e.stage]} · ${e.type}`,
      target: targetOf(e),
      caseId: e.caseId,
      signalId: e.signalId,
      outcome: e.status,
      errorClass: e.errorClass,
    }));
}

export function filterAudit(
  rows: readonly AuditRow[],
  filters: { actor?: string; type?: EventType; caseId?: string },
): AuditRow[] {
  return rows.filter((r) => {
    if (filters.actor && r.actor !== filters.actor) return false;
    if (filters.type && r.type !== filters.type) return false;
    if (filters.caseId && r.caseId !== filters.caseId) return false;
    return true;
  });
}
