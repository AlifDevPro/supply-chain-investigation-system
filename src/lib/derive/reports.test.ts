import { describe, expect, it } from "vitest";
import { computeReportMetrics, reportDataSourceLabel } from "./reports";

describe("reportDataSourceLabel", () => {
  it("distinguishes fixtures from persisted modes and always denies operational claims", () => {
    expect(reportDataSourceLabel("fixtures")).toMatch(/fixture/i);
    expect(reportDataSourceLabel("memory")).toMatch(/server memory/i);
    expect(reportDataSourceLabel("database")).toMatch(/Postgres/i);
    for (const mode of ["fixtures", "memory", "database"] as const) {
      expect(reportDataSourceLabel(mode)).toMatch(/Not operational data/);
    }
  });
});

describe("computeReportMetrics throughput and verification rate", () => {
  it("counts cases opened in window and leaves verification rate unmeasured without executions", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    const metrics = computeReportMetrics({
      window: "24h",
      now,
      signals: [],
      events: [
        {
          id: "e1",
          sequence: 1,
          tenantId: "t",
          caseId: "INV-1",
          signalId: null,
          correlationId: "c1",
          type: "outcome.verified",
          stage: "verified",
          status: "completed",
          occurredAt: "2026-10-24T11:00:00.000Z",
          durationMs: null,
          method: null,
          retryCount: 0,
          errorClass: null,
          metadata: {},
          dataMode: "synthetic",
        },
      ],
      cases: [
        {
          id: "INV-1",
          title: "Case",
          summary: "Summary",
          state: "needs_review",
          severity: "high",
          ownerName: "Ops",
          ownerRole: "reviewer",
          nextAction: "Review",
          requiresReview: true,
          reviewReason: null,
          openedAt: "2026-10-24T10:00:00.000Z",
          updatedAt: "2026-10-24T10:00:00.000Z",
          impactLabel: "none",
          impactStatus: "none",
          shortage: null,
          claimSummary: { verified: 0, reported: 0, inferred: 0, assumed: 0, unknown: 0, conflicted: 0, stale: 0 },
          affectedOrders: 0,
          dataMode: "synthetic",
        },
        {
          id: "INV-2",
          title: "Old",
          summary: "Old",
          state: "resolved",
          severity: "low",
          ownerName: "Ops",
          ownerRole: "reviewer",
          nextAction: "None",
          requiresReview: false,
          reviewReason: null,
          openedAt: "2026-10-01T10:00:00.000Z",
          updatedAt: "2026-10-01T10:00:00.000Z",
          impactLabel: "none",
          impactStatus: "none",
          shortage: null,
          claimSummary: { verified: 0, reported: 0, inferred: 0, assumed: 0, unknown: 0, conflicted: 0, stale: 0 },
          affectedOrders: 0,
          dataMode: "synthetic",
        },
      ],
      findings: [],
      extractions: [],
    });
    expect(metrics.investigationThroughput).toBe(1);
    expect(metrics.verifiedOutcomes).toBe(1);
    expect(metrics.verificationRate.rate).toBeNull();
    expect(metrics.verificationRate.denominator).toBe(0);
  });
});
