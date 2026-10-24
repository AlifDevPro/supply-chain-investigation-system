import { describe, expect, it } from "vitest";
import { evidence2041 } from "@/fixtures/investigation-2041";
import { cases, events, SNAPSHOT_AT } from "@/fixtures/dataset";
import { signalToRecord } from "@/lib/data/records";
import { signals } from "@/fixtures/dataset";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { emptyCatalog } from "@/lib/store/catalog-types";
import { auditTrail, filterAudit } from "./audit";
import { catalogGraph, expandableNodeIds, focusGraph } from "./graph";
import { computeReportMetrics, parseReportWindow } from "./reports";
import { buildReviewQueue } from "./review-queue";

const NOW = "2026-10-24T08:00:00.000Z";

describe("buildReviewQueue", () => {
  it("includes held signals without a case and cases awaiting review, oldest first within a severity", () => {
    const records = signals.map(signalToRecord);
    const queue = buildReviewQueue(records, cases, NOW);
    expect(queue.some((i) => i.kind === "held_signal" && i.signalId === "SIG-8844")).toBe(true);
    expect(queue.some((i) => i.kind === "held_signal" && i.caseId)).toBe(false);
    expect(queue.filter((i) => i.kind === "case").every((i) => i.caseId)).toBe(true);
    const first = queue[0]!;
    expect(first.severity).toBe("critical");
    const times = queue.filter((i) => i.severity === first.severity).map((i) => i.at);
    expect(times).toEqual([...times].sort());
  });

  it("returns an empty list when nothing is waiting", () => {
    expect(buildReviewQueue([], [], NOW)).toEqual([]);
  });

  it("drops a held signal once a closing decision exists", () => {
    const records = signals.map(signalToRecord);
    const queue = buildReviewQueue(records, cases, NOW, new Set(["SIG-8844"]));
    expect(queue.some((i) => i.signalId === "SIG-8844")).toBe(false);
  });
});

describe("computeReportMetrics", () => {
  it("treats a zero denominator as not measured and only uses recorded durations", () => {
    const empty = computeReportMetrics({
      window: "all", now: new Date(NOW), signals: [], events: [], cases: [], findings: [], extractions: [],
    });
    expect(empty.duplicateRate.rate).toBeNull();
    expect(empty.rulesAgreement.rate).toBeNull();
    expect(empty.measuredLatency).toEqual({ samples: 0, medianMs: null });
    expect(empty.heldBacklog).toEqual({ count: 0, oldestAgeHours: null });
  });

  it("counts fixture signals in a window and ignores events without a duration", () => {
    const metrics = computeReportMetrics({
      window: "all",
      now: new Date(SNAPSHOT_AT),
      signals: signals.map(signalToRecord),
      events,
      cases,
      findings: [{ unknowns: evidence2041.length > 0 ? 2 : 0, conflicts: 1 }],
      extractions: [],
    });
    expect(metrics.signalsInWindow).toBe(signals.length);
    expect(metrics.volumeBySourceType.some((r) => r.count > 0)).toBe(true);
    expect(metrics.casesByState.some((r) => r.key === "needs_review")).toBe(true);
    expect(metrics.measuredLatency.samples).toBe(events.filter((e) => e.durationMs !== null).length);
    expect(parseReportWindow("7d")).toBe("7d");
    expect(parseReportWindow("nope")).toBe("all");
  });
});

describe("catalogGraph", () => {
  it("builds verified supplier-to-shipment links from foreign keys", () => {
    const catalog = { ...emptyCatalog(), ...syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z")), updatedAt: SNAPSHOT_AT, truncated: false };
    const full = catalogGraph(catalog);
    expect(full.nodes.some((n) => n.id === "material:NV-4410")).toBe(true);
    expect(full.edges).toContainEqual({
      from: "supplier:SUP-103",
      to: "purchase_order:PO-77410",
      relationship: "verified",
      basis: "purchase_orders.supplier_id",
    });
    expect(full.edges).toContainEqual({
      from: "purchase_order:PO-77120",
      to: "shipment:SHP-30871",
      relationship: "verified",
      basis: "shipments.purchase_order_id",
    });
    const focused = focusGraph(full, { kind: "material", id: "NV-4410" });
    expect(focused.focused).toBe(true);
    expect(focused.nodes.some((n) => n.id === "material:NV-4410")).toBe(true);
    expect(focused.nodes.some((n) => n.id === "purchase_order:PO-77410")).toBe(true);
    expect(focused.nodes.some((n) => n.id === "shipment:SHP-30871")).toBe(false);
    expect(focusGraph(full, { kind: "material", id: "NOPE" }).nodes).toEqual([]);
    const expandable = expandableNodeIds(full, focused);
    expect(expandable).toContain("purchase_order:PO-77410");
    const expanded = focusGraph(full, { kind: "material", id: "NV-4410" }, ["purchase_order:PO-77410"]);
    expect(expanded.nodes.some((n) => n.id === "supplier:SUP-103")).toBe(true);
  });
});

describe("auditTrail", () => {
  it("uses the recorded actor and keeps tenant-unrelated fields out", () => {
    const rows = auditTrail(events);
    expect(rows[0]!.at >= rows[rows.length - 1]!.at).toBe(true);
    expect(rows.every((r) => r.actor.length > 0)).toBe(true);
    const created = rows.find((r) => r.type === "investigation.created");
    expect(created?.action).toBe("Investigation created");
    expect(filterAudit(rows, { type: "investigation.created" }).every((r) => r.type === "investigation.created")).toBe(true);
  });
});
