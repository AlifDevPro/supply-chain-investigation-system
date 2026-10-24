import { describe, expect, it } from "vitest";
import type { InvestigationEvent } from "@/lib/domain";
import { NO_FILTERS, buildTrace, filterEvents, holdEvents, isFiltering } from "./trace";

function ev(partial: Partial<InvestigationEvent> & Pick<InvestigationEvent, "id" | "stage" | "type" | "occurredAt">): InvestigationEvent {
  return {
    sequence: 0,
    tenantId: "t-demo",
    caseId: null,
    signalId: "SIG-1",
    correlationId: "corr-1",
    status: "completed",
    durationMs: 10,
    method: null,
    retryCount: 0,
    errorClass: null,
    metadata: {},
    dataMode: "synthetic",
    ...partial,
  };
}

const events: InvestigationEvent[] = [
  ev({ id: "e3", sequence: 3, stage: "triaged", type: "triage.completed", occurredAt: "2026-10-23T10:00:01.200Z" }),
  ev({ id: "e1", sequence: 1, stage: "received", type: "signal.received", occurredAt: "2026-10-23T10:00:00.000Z" }),
  ev({ id: "e2", sequence: 2, stage: "validated", type: "signal.validated", occurredAt: "2026-10-23T10:00:00.300Z" }),
  ev({ id: "e4", sequence: 4, stage: "evidence", type: "evidence.retrieved", status: "failed", errorClass: "timeout", occurredAt: "2026-10-23T10:00:04.000Z" }),
  ev({ id: "e5", sequence: 5, stage: "evidence", type: "evidence.retrieved", status: "completed", retryCount: 1, occurredAt: "2026-10-23T10:00:09.000Z" }),
  ev({ id: "x1", sequence: 6, stage: "received", type: "signal.received", correlationId: "corr-2", signalId: "SIG-2", occurredAt: "2026-10-23T11:00:00.000Z" }),
];

describe("buildTrace", () => {
  it("orders steps by workflow stage and only includes the requested correlation", () => {
    const t = buildTrace("corr-1", events);
    expect(t.eventCount).toBe(5);
    expect(t.steps.map((s) => s.stage)).toEqual([
      "received", "validated", "deduplicated", "triaged", "evidence", "impact", "case", "extraction", "review", "action", "verified",
    ]);
    expect(t.signalId).toBe("SIG-1");
  });

  it("marks stages with no event as missing instead of implying they ran or were skipped", () => {
    const t = buildTrace("corr-1", events);
    const missing = t.steps.filter((s) => s.kind === "missing").map((s) => s.stage);
    expect(missing).toEqual(["deduplicated", "impact", "case", "extraction", "review", "action", "verified"]);
  });

  it("computes gaps from the previous recorded stage and never reports a gap for the first step", () => {
    const t = buildTrace("corr-1", events);
    const recorded = t.steps.filter((s) => s.kind === "recorded");
    expect(recorded[0]).toMatchObject({ stage: "received", gapFromPreviousMs: null });
    expect(recorded[1]).toMatchObject({ stage: "validated", gapFromPreviousMs: 300 });
    // validated at .300 -> triaged at 1.200 (deduplicated has no event)
    expect(recorded[2]).toMatchObject({ stage: "triaged", gapFromPreviousMs: 900 });
  });

  it("keeps retries together under one stage in time order", () => {
    const t = buildTrace("corr-1", events);
    const evidence = t.steps.find((s) => s.stage === "evidence");
    expect(evidence?.kind).toBe("recorded");
    if (evidence?.kind === "recorded") expect(evidence.events.map((e) => e.id)).toEqual(["e4", "e5"]);
  });

  it("ignores duplicate deliveries", () => {
    const t = buildTrace("corr-1", [...events, ...events]);
    expect(t.eventCount).toBe(5);
  });

  it("returns an empty trace for an unknown correlation id", () => {
    const t = buildTrace("corr-missing", events);
    expect(t.eventCount).toBe(0);
    expect(t.spanMs).toBeNull();
    expect(t.steps.every((s) => s.kind === "missing")).toBe(true);
  });
});

describe("filterEvents", () => {
  it("returns everything with no filters", () => {
    expect(filterEvents(events, NO_FILTERS)).toHaveLength(events.length);
    expect(isFiltering(NO_FILTERS)).toBe(false);
  });

  it("combines filters with AND", () => {
    const f = { ...NO_FILTERS, status: "failed" as const, stage: "evidence" as const };
    expect(filterEvents(events, f).map((e) => e.id)).toEqual(["e4"]);
    expect(isFiltering(f)).toBe(true);
  });
});

describe("holdEvents", () => {
  it("counts only events that were not in the frozen view", () => {
    const frozen = events.slice(0, 3);
    const incoming = [...events, ...events];
    expect(holdEvents(frozen, incoming).pending).toBe(3);
  });
});
