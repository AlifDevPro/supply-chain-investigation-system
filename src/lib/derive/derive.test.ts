import { describe, expect, it } from "vitest";
import type { InvestigationCase, InvestigationEvent } from "@/lib/domain";
import {
  attentionItems,
  computeOverviewMetrics,
  dedupeEvents,
  sortEventsNewestFirst,
  summarizeClaims,
  summarizeStages,
} from "./index";

const zero = { verified: 0, reported: 0, inferred: 0, assumed: 0, unknown: 0, conflicted: 0, stale: 0 };

function c(over: Partial<InvestigationCase>): InvestigationCase {
  return {
    id: "INV-1",
    title: "t",
    summary: "s",
    state: "investigating",
    severity: "medium",
    ownerName: "o",
    ownerRole: "r",
    nextAction: "n",
    requiresReview: false,
    reviewReason: null,
    openedAt: "2026-10-23T00:00:00Z",
    updatedAt: "2026-10-23T00:00:00Z",
    impactLabel: "x",
    impactStatus: "none",
    shortage: null,
    claimSummary: zero,
    affectedOrders: 0,
    dataMode: "synthetic",
    ...over,
  };
}

function e(over: Partial<InvestigationEvent>): InvestigationEvent {
  return {
    id: "E1",
    sequence: 1,
    tenantId: "t",
    caseId: null,
    signalId: "SIG-1",
    correlationId: "corr-1",
    type: "signal.received",
    stage: "received",
    status: "completed",
    occurredAt: "2026-10-23T10:00:00Z",
    durationMs: null,
    method: null,
    retryCount: 0,
    errorClass: null,
    metadata: {},
    dataMode: "synthetic",
    ...over,
  };
}

describe("summarizeClaims", () => {
  it("counts every state and keeps zeros", () => {
    const r = summarizeClaims([{ state: "verified" }, { state: "reported" }, { state: "reported" }]);
    expect(r.verified).toBe(1);
    expect(r.reported).toBe(2);
    expect(r.conflicted).toBe(0);
  });
});

describe("events", () => {
  it("orders newest first and breaks ties by sequence", () => {
    const a = e({ id: "a", sequence: 1 });
    const b = e({ id: "b", sequence: 2 });
    const later = e({ id: "c", sequence: 0, occurredAt: "2026-10-23T11:00:00Z" });
    expect(sortEventsNewestFirst([a, b, later]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("ignores duplicate deliveries of the same event id", () => {
    const a = e({ id: "a" });
    expect(dedupeEvents([a, { ...a }, e({ id: "b" })]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("summarizes stages from the latest event per correlation and stage", () => {
    const events = [
      e({ id: "1", sequence: 1, stage: "evidence", status: "failed", occurredAt: "2026-10-23T10:00:00Z" }),
      e({ id: "2", sequence: 2, stage: "evidence", status: "completed", occurredAt: "2026-10-23T10:00:30Z" }),
      e({ id: "3", sequence: 3, correlationId: "corr-2", stage: "evidence", status: "waiting" }),
    ];
    const s = summarizeStages(events);
    expect(s.evidence.completed).toBe(1);
    expect(s.evidence.failed).toBe(0);
    expect(s.evidence.waiting).toBe(1);
    expect(s.action.completed).toBe(0);
  });
});

describe("overview metrics", () => {
  it("counts only active cases and separates verified from provisional", () => {
    const m = computeOverviewMetrics([
      c({ id: "1", state: "needs_review", impactStatus: "provisional", affectedOrders: 2, shortage: { quantity: 10, unit: "m", status: "provisional" } }),
      c({ id: "2", state: "resolved", impactStatus: "verified", affectedOrders: 5 }),
      c({ id: "3", state: "investigating", impactStatus: "verified", affectedOrders: 1, shortage: { quantity: 3, unit: "pcs", status: "verified" } }),
    ]);
    expect(m.activeInvestigations).toBe(2);
    expect(m.awaitingReview).toBe(1);
    expect(m.ordersAtRisk).toEqual({ total: 3, verified: 1, provisional: 2 });
    expect(m.shortages).toEqual({ total: 2, verified: 1, provisional: 1 });
  });
});

describe("attentionItems", () => {
  it("sorts by severity and includes conflicted or stale evidence", () => {
    const items = attentionItems([
      c({ id: "low", severity: "low", state: "needs_review" }),
      c({ id: "crit", severity: "critical", state: "needs_review" }),
      c({ id: "conf", severity: "high", claimSummary: { ...zero, conflicted: 1 } }),
      c({ id: "quiet", severity: "critical" }),
      c({ id: "done", severity: "critical", state: "resolved", claimSummary: { ...zero, stale: 1 } }),
    ]);
    expect(items.map((i) => i.case.id)).toEqual(["crit", "conf", "low"]);
    expect(items[1]?.reasons).toContain("conflicting_evidence");
  });
});
