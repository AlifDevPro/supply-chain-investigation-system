import {
  STAGES,
  type CaseState,
  type Claim,
  type ClaimState,
  type EventStatus,
  type InvestigationCase,
  type InvestigationEvent,
  type Severity,
  type Stage,
} from "@/lib/domain";

/** Pure derivations over domain records. No formatting, no React. */

export const TERMINAL_STATES: readonly CaseState[] = ["resolved", "rejected", "dismissed", "failed", "cancelled"];
export const REVIEW_STATES: readonly CaseState[] = ["needs_review", "awaiting_approval"];

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function isActive(c: Pick<InvestigationCase, "state">): boolean {
  return !TERMINAL_STATES.includes(c.state);
}

export function summarizeClaims(claims: readonly Pick<Claim, "state">[]): Record<ClaimState, number> {
  const out: Record<ClaimState, number> = {
    verified: 0,
    reported: 0,
    inferred: 0,
    assumed: 0,
    unknown: 0,
    conflicted: 0,
    stale: 0,
  };
  for (const c of claims) out[c.state] += 1;
  return out;
}

/** Newest first. Ties are broken by the monotonic sequence number so out-of-order delivery is stable. */
export function sortEventsNewestFirst(events: readonly InvestigationEvent[]): InvestigationEvent[] {
  return [...events].sort((a, b) => {
    const t = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    return t !== 0 ? t : b.sequence - a.sequence;
  });
}

export function sortEventsOldestFirst(events: readonly InvestigationEvent[]): InvestigationEvent[] {
  return sortEventsNewestFirst(events).reverse();
}

/** Drops duplicate deliveries (same event id), keeping the first occurrence. */
export function dedupeEvents(events: readonly InvestigationEvent[]): InvestigationEvent[] {
  const seen = new Set<string>();
  const out: InvestigationEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export type StageSummary = Record<Stage, Record<EventStatus, number>>;

/**
 * Counts, per stage, the latest event of every (correlation, stage) pair by status.
 * Derived only from recorded events. A stage nobody reached shows zeros.
 */
export function summarizeStages(events: readonly InvestigationEvent[]): StageSummary {
  const empty = (): Record<EventStatus, number> => ({
    completed: 0,
    failed: 0,
    retrying: 0,
    waiting: 0,
    skipped: 0,
  });
  const out = Object.fromEntries(STAGES.map((s) => [s, empty()])) as StageSummary;
  const latest = new Map<string, InvestigationEvent>();
  for (const e of events) {
    const key = `${e.correlationId}::${e.stage}`;
    const prev = latest.get(key);
    if (
      !prev ||
      Date.parse(e.occurredAt) > Date.parse(prev.occurredAt) ||
      (e.occurredAt === prev.occurredAt && e.sequence > prev.sequence)
    ) {
      latest.set(key, e);
    }
  }
  for (const e of latest.values()) out[e.stage][e.status] += 1;
  return out;
}

export type OverviewMetrics = {
  activeInvestigations: number;
  awaitingReview: number;
  ordersAtRisk: { total: number; verified: number; provisional: number };
  shortages: { total: number; verified: number; provisional: number };
};

export function computeOverviewMetrics(cases: readonly InvestigationCase[]): OverviewMetrics {
  const active = cases.filter(isActive);
  const impacted = active.filter((c) => c.affectedOrders > 0 && c.impactStatus !== "none");
  const shortageCases = active.filter((c) => c.shortage !== null);
  const sumOrders = (list: readonly InvestigationCase[]) => list.reduce((n, c) => n + c.affectedOrders, 0);
  return {
    activeInvestigations: active.length,
    awaitingReview: active.filter((c) => REVIEW_STATES.includes(c.state)).length,
    ordersAtRisk: {
      total: sumOrders(impacted),
      verified: sumOrders(impacted.filter((c) => c.impactStatus === "verified")),
      provisional: sumOrders(impacted.filter((c) => c.impactStatus !== "verified")),
    },
    shortages: {
      total: shortageCases.length,
      verified: shortageCases.filter((c) => c.shortage?.status === "verified").length,
      provisional: shortageCases.filter((c) => c.shortage?.status !== "verified").length,
    },
  };
}

export type AttentionReason = "awaiting_review" | "conflicting_evidence" | "stale_evidence" | "blocked";

export type AttentionItem = { case: InvestigationCase; reasons: AttentionReason[] };

/**
 * Cases that need a person now: awaiting review, blocked, or carrying conflicting / stale evidence.
 * Sorted by severity, then most recently updated.
 */
export function attentionItems(cases: readonly InvestigationCase[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of cases.filter(isActive)) {
    const reasons: AttentionReason[] = [];
    if (REVIEW_STATES.includes(c.state)) reasons.push("awaiting_review");
    if (c.state === "blocked") reasons.push("blocked");
    if (c.claimSummary.conflicted > 0) reasons.push("conflicting_evidence");
    if (c.claimSummary.stale > 0) reasons.push("stale_evidence");
    if (reasons.length > 0) items.push({ case: c, reasons });
  }
  return items.sort((a, b) => {
    const s = SEVERITY_RANK[b.case.severity] - SEVERITY_RANK[a.case.severity];
    return s !== 0 ? s : Date.parse(b.case.updatedAt) - Date.parse(a.case.updatedAt);
  });
}

/** Case-count by lifecycle state, in lifecycle order, omitting empty states. */
export { buildReviewQueue, type ReviewQueueItem, type QueueKind } from "./review-queue";
export { computeReportMetrics, parseReportWindow, REPORT_WINDOWS, WINDOW_LABEL, type ReportMetrics, type ReportWindow, type NamedCount } from "./reports";
export { catalogGraph, focusGraph, graphFocusOptions, expandableNodeIds, type GraphNode, type GraphEdge, type SupplyGraph, type GraphFocusKind } from "./graph";
export { auditTrail, filterAudit, type AuditRow } from "./audit";

export function stageDistribution(
  cases: readonly InvestigationCase[],
  order: readonly CaseState[],
): Array<{ state: CaseState; count: number }> {
  return order
    .map((state) => ({ state, count: cases.filter((c) => c.state === state).length }))
    .filter((r) => r.count > 0);
}
