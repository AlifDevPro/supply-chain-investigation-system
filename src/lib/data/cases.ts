import type {
  AuditEntry,
  ClaimState,
  InvestigationCase,
  InvestigationDetail,
  InvestigationEvent,
  Signal,
} from "@/lib/domain";
import { formatQuantity } from "@/lib/format";
import type { CaseDetailRecord, CaseListItem, StoredCase, StoredRun } from "@/lib/store/investigation-types";
import type { StoredSignal } from "@/lib/store/types";

type Latest = Pick<StoredRun, "shortage" | "deliveryRisk"> & { claimStates: ClaimState[] };

const EMPTY_SUMMARY: InvestigationCase["claimSummary"] = {
  verified: 0, reported: 0, inferred: 0, assumed: 0, unknown: 0, conflicted: 0, stale: 0,
};

/** Table line derived from the persisted calculations. Never typed by hand. */
function impactLine(latest: Latest | null): Pick<InvestigationCase, "impactLabel" | "impactStatus" | "shortage" | "affectedOrders"> {
  const shortage = latest?.shortage ?? null;
  const risk = latest?.deliveryRisk ?? null;
  const affected = risk?.affectedOrders.length ?? 0;
  let impactLabel = "Impact not calculated";
  if (shortage && shortage.deficit !== null) {
    impactLabel = `${shortage.status === "verified" ? "Shortage" : "Provisional shortage"} ${formatQuantity(shortage.deficit, shortage.unit)}`;
  } else if (affected > 0) {
    impactLabel = `${affected} order(s) need it before arrival`;
  } else if (risk?.delayDays !== null && risk?.delayDays !== undefined) {
    impactLabel = `Arrival ${risk.delayDays} day(s) after promise`;
  } else if (shortage || risk) {
    impactLabel = "Not calculable from available records";
  }
  return {
    impactLabel,
    impactStatus: shortage?.status ?? risk?.status ?? "none",
    shortage: shortage ? { quantity: shortage.deficit, unit: shortage.unit, status: shortage.status } : null,
    affectedOrders: affected,
  };
}

export function toInvestigationCase(c: StoredCase, latest: Latest | null): InvestigationCase {
  const claimSummary = { ...EMPTY_SUMMARY };
  for (const state of latest?.claimStates ?? []) claimSummary[state] += 1;
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    state: c.state,
    severity: c.severity,
    ownerName: c.ownerName,
    ownerRole: c.ownerRole,
    nextAction: c.nextAction,
    requiresReview: c.requiresReview,
    reviewReason: c.reviewReason,
    openedAt: c.openedAt,
    updatedAt: c.updatedAt,
    ...impactLine(latest),
    claimSummary,
    dataMode: c.dataMode,
  };
}

export function listItemToCase(item: CaseListItem): InvestigationCase {
  return toInvestigationCase(item.case, item.latest);
}

function toSignal(s: StoredSignal): Signal | null {
  if (!s.sourceType || !s.sourceSystem || !s.label || !s.triageOutcome) return null;
  return {
    id: s.id,
    sourceType: s.sourceType,
    sourceSystem: s.sourceSystem,
    label: s.label,
    receivedAt: s.receivedAt,
    triageOutcome: s.triageOutcome,
    caseId: s.caseId,
    correlationId: s.correlationId,
    dataMode: s.dataMode,
  };
}

const TYPE_TEXT: Partial<Record<InvestigationEvent["type"], string>> = {
  "investigation.created": "Case created",
  "investigation.updated": "Case re-analysed",
  "investigation.needs_review": "Review requested",
  "evidence.retrieved": "Evidence retrieval",
};

/**
 * Audit history derived from this case's persisted events: who (system or the signed-in user)
 * did what, when. Nothing is added that the events do not record.
 */
function auditFromEvents(caseId: string, events: readonly InvestigationEvent[]): AuditEntry[] {
  return events
    .filter((e) => e.caseId === caseId && TYPE_TEXT[e.type] && (e.type !== "evidence.retrieved" || e.status === "failed"))
    .map((e) => {
      const m = e.metadata;
      const detail =
        e.type === "evidence.retrieved"
          ? `Failed (${e.errorClass ?? "error"}); the signal remained stored.`
          : e.type === "investigation.needs_review"
            ? String(m.reason ?? "Review required.")
            : `Run ${String(m.runNumber ?? "?")} (${String(m.trigger ?? "unknown").replace("_", " ")}): state ${String(m.state ?? "?")}, severity ${String(m.severity ?? "?")}.`;
      return {
        id: e.id,
        caseId,
        at: e.occurredAt,
        actor: String(m.actor ?? "system"),
        action: TYPE_TEXT[e.type]!,
        detail,
        dataMode: e.dataMode,
      };
    })
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function toInvestigationDetail(
  record: CaseDetailRecord,
  signals: readonly StoredSignal[],
  events: readonly InvestigationEvent[],
): InvestigationDetail {
  const { case: c, latest } = record;
  const originLink = record.links.find((l) => l.linkReason !== "related_reference") ?? record.links[0];
  const origin = signals.find((s) => s.id === originLink?.signalId) ?? null;
  return {
    case: toInvestigationCase(c, latest && { ...latest, claimStates: latest.claims.map((x) => x.state) }),
    detailAvailable: latest !== null,
    sourceSignal: origin ? toSignal(origin) : null,
    evidence: latest?.evidence ?? [],
    claims: latest?.claims ?? [],
    impact: latest?.shortage ?? null,
    deliveryRisk: latest?.deliveryRisk ?? null,
    unknowns: latest?.unknowns ?? [],
    conflicts: latest?.conflicts ?? [],
    entities: latest?.entities ?? { nodes: [], edges: [] },
    actions: [], // filled by the caller from governance when persisted
    events: [...events],
    audit: auditFromEvents(c.id, events),
    runs: record.runs,
    linkedSignalIds: record.links.map((l) => l.signalId),
  };
}
