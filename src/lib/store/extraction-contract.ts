import { describe, expect, it } from "vitest";
import type { ExtractionOutcome } from "@/lib/ai/extract";
import { makeEventDraft, makeStored, TENANT_A, TENANT_B } from "./contract";
import type { ExtractionRepository } from "./extraction-types";
import { ForeignKeyViolationError, type SignalRepository } from "./types";

export interface ExtractionHarness {
  signals: SignalRepository;
  extractions: ExtractionRepository;
  close?: () => Promise<void>;
}

const AT = "2026-10-24T09:10:00.000Z";

export function makeOutcome(overrides: Partial<ExtractionOutcome> = {}): ExtractionOutcome {
  return {
    status: "completed",
    provider: "mock",
    model: "mock-extractor-1",
    promptVersion: "signal-extraction.v1",
    fields: [{ field: "purchaseOrder", value: "PO-77410", quote: "PO-77410" }],
    rejected: [{ field: "delayDays", code: "value_not_in_quote" }],
    comparison: [{ field: "purchaseOrder", ai: "PO-77410", rules: "PO-77410", result: "agrees" }],
    failure: null,
    inputChars: 900,
    outputChars: 120,
    inputTokens: null,
    outputTokens: null,
    latencyMs: 4,
    attempts: 1,
    ...overrides,
  };
}

const extractionEvent = (signalId: string, at = AT, overrides = {}) =>
  makeEventDraft(signalId, `corr-${signalId}`, at, {
    type: "extraction.completed",
    stage: "extraction",
    method: { kind: "model", name: "mock:mock-extractor-1" },
    metadata: { provider: "mock", fields: 1 },
    ...overrides,
  });

/** Shared behavior for every ExtractionRepository implementation. */
export function describeExtractionContract(name: string, factory: () => Promise<ExtractionHarness>) {
  async function setup() {
    const h = await factory();
    await h.signals.ensureTenant(TENANT_A, "A");
    await h.signals.ensureTenant(TENANT_B, "B");
    await h.signals.transaction(async (tx) => {
      await tx.insertSignal(makeStored("SIG-1", TENANT_A));
      await tx.insertSignal(makeStored("SIG-2", TENANT_A, { sourceRecordId: "MSG-2" }));
      await tx.insertSignal(makeStored("SIG-9", TENANT_B));
    });
    return h;
  }

  describe(`ExtractionRepository contract: ${name}`, () => {
    it("stores an extraction with its event and reads the latest per signal", async () => {
      const h = await setup();
      const first = await h.extractions.record(TENANT_A, "SIG-1", makeOutcome({ status: "unavailable", failure: "unreachable", fields: [], comparison: [], rejected: [] }), extractionEvent("SIG-1", AT, { type: "extraction.failed", status: "failed", errorClass: "source_unavailable" }));
      expect(first.id).toBe("SIG-1-AI1");
      const second = await h.extractions.record(TENANT_A, "SIG-1", makeOutcome(), extractionEvent("SIG-1", "2026-10-24T09:11:00.000Z"));
      expect(second.id).toBe("SIG-1-AI2");
      const latest = await h.extractions.latestForSignals(TENANT_A, ["SIG-1", "SIG-2"]);
      expect(Object.keys(latest)).toEqual(["SIG-1"]);
      expect(latest["SIG-1"]).toMatchObject({
        id: "SIG-1-AI2",
        status: "completed",
        fields: [{ field: "purchaseOrder", value: "PO-77410", quote: "PO-77410" }],
        rejected: [{ field: "delayDays", code: "value_not_in_quote" }],
        comparison: [{ field: "purchaseOrder", result: "agrees" }],
        createdAt: "2026-10-24T09:11:00.000Z",
        dataMode: "synthetic",
      });
      expect((await h.extractions.listExtractions(TENANT_A, { limit: 10 })).map((x) => x.id)).toEqual(["SIG-1-AI2", "SIG-1-AI1"]);
      const events = await h.signals.listEvents(TENANT_A, { limit: 10, correlationId: "corr-SIG-1" });
      expect(events.map((e) => e.type).sort()).toEqual(["extraction.completed", "extraction.failed"]);
      expect(events.every((e) => e.stage === "extraction")).toBe(true);
      await h.close?.();
    });

    it("is tenant-scoped on read and write", async () => {
      const h = await setup();
      await h.extractions.record(TENANT_A, "SIG-1", makeOutcome(), extractionEvent("SIG-1"));
      expect(await h.extractions.latestForSignals(TENANT_B, ["SIG-1"])).toEqual({});
      expect(await h.extractions.listExtractions(TENANT_B, { limit: 10 })).toEqual([]);
      expect((await h.extractions.completedSignalIds(TENANT_B, { provider: "mock", model: "mock-extractor-1", promptVersion: "signal-extraction.v1" })).size).toBe(0);
      // Tenant A cannot attach an extraction to tenant B's signal.
      await expect(h.extractions.record(TENANT_A, "SIG-9", makeOutcome(), extractionEvent("SIG-9"))).rejects.toBeInstanceOf(ForeignKeyViolationError);
      await h.close?.();
    });

    it("keys completed extractions by provider, model and prompt version", async () => {
      const h = await setup();
      await h.extractions.record(TENANT_A, "SIG-1", makeOutcome(), extractionEvent("SIG-1"));
      await h.extractions.record(TENANT_A, "SIG-2", makeOutcome({ status: "timeout", failure: "timeout", fields: [], comparison: [], rejected: [] }), extractionEvent("SIG-2", AT, { type: "extraction.failed", status: "failed", errorClass: "timeout" }));
      const key = { provider: "mock", model: "mock-extractor-1", promptVersion: "signal-extraction.v1" };
      expect([...(await h.extractions.completedSignalIds(TENANT_A, key))]).toEqual(["SIG-1"]);
      expect((await h.extractions.completedSignalIds(TENANT_A, { ...key, model: "qwen2.5:3b" })).size).toBe(0);
      expect((await h.extractions.completedSignalIds(TENANT_A, { ...key, promptVersion: "signal-extraction.v2" })).size).toBe(0);
      await h.close?.();
    });

    it("stores nothing when the event cannot be written", async () => {
      const h = await setup();
      await expect(
        h.extractions.record(TENANT_A, "SIG-1", makeOutcome(), extractionEvent("SIG-1", AT, { caseId: "INV-404" })),
      ).rejects.toThrow();
      expect(await h.extractions.latestForSignals(TENANT_A, ["SIG-1"])).toEqual({});
      expect(await h.signals.listEvents(TENANT_A, { limit: 10, correlationId: "corr-SIG-1" })).toEqual([]);
      await h.close?.();
    });
  });
}
