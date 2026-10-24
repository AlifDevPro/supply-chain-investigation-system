import { describe, expect, it, vi } from "vitest";
import type { AiConfig } from "@/lib/ai/config";
import { MockProvider } from "@/lib/ai/mock";
import { AiUnavailableError, type AiProvider } from "@/lib/ai/provider";
import { makeRaw } from "@/lib/ingestion/test-helpers";
import { AI_OFF, depsOf, memoryRuntime, MOCK_AI } from "@/test/memory-runtime";
import { backfillExtractions, extractForSignal } from "./extraction";
import { ingestAndInvestigate } from "./ingest";

const T = "tenant-demo";

const TRIM = {
  label: "Supplier notice: PO-77210 trim delivery delayed two days",
  references: { purchaseOrder: "PO-77210", material: "TR-5502" },
  quantity: { value: 1200, unit: "m" as const },
  sourceRecordId: "msg-1",
};

const ROUTINE = {
  sourceType: "inventory_balance" as const,
  label: "Nightly stock sync, warehouse W1",
  attributes: { routineSync: true, varianceDetected: false },
  sourceRecordId: "sync-1",
};

const down: AiProvider = {
  kind: "ollama",
  model: "qwen2.5:3b",
  label: "local Ollama (qwen2.5:3b)",
  generateJson: async () => {
    throw new AiUnavailableError("unreachable");
  },
};

async function setup(ai: AiConfig = MOCK_AI) {
  const rt = await memoryRuntime(T, "memory", ai);
  const deps = { repo: rt.repo, caseIndex: rt.caseIndex, investigation: depsOf(rt) };
  return { rt, deps, ingest: (o: Parameters<typeof makeRaw>[0]) => ingestAndInvestigate(T, makeRaw(o), deps) };
}

describe("ingestAndInvestigate with AI extraction", () => {
  it("records a grounded extraction and an extraction.completed event linked to the case", async () => {
    const { rt, ingest } = await setup();
    const res = await ingest(TRIM);
    expect(res.investigation?.status).toBe("created");
    expect(res.extraction).toMatchObject({ status: "completed", extractionId: `${res.outcome.signalId}-AI1` });
    const stored = await rt.extractions.latestForSignals(T, [res.outcome.signalId]);
    const x = stored[res.outcome.signalId]!;
    expect(x.fields.map((f) => f.field)).toEqual(["delayDays", "purchaseOrder"]);
    expect(x.comparison.find((c) => c.field === "delayDays")).toMatchObject({ ai: 2, rules: 2, result: "agrees" });
    expect(x.comparison.find((c) => c.field === "material")?.result).toBe("rules_only");
    const event = rt.db.events.find((e) => e.type === "extraction.completed")!;
    expect(event).toMatchObject({
      stage: "extraction", status: "completed", caseId: res.investigation?.caseId, signalId: res.outcome.signalId,
      correlationId: res.outcome.correlationId, method: { kind: "model", name: "mock:mock-extractor-1" },
    });
    expect(event.metadata).toMatchObject({ actor: "system", provider: "mock", fields: 2, rejected: 0, disagreements: 0 });
    expect(JSON.stringify(event.metadata)).not.toMatch(/trim delivery/);
  });

  it("reports disabled and makes no record when AI is off", async () => {
    const { rt, ingest } = await setup(AI_OFF);
    const res = await ingest(TRIM);
    expect(res.extraction).toEqual({ status: "disabled", extractionId: null, detail: "AI_PROVIDER=none" });
    expect(rt.db.extractions).toHaveLength(0);
    expect(rt.db.events.some((e) => e.stage === "extraction")).toBe(false);
  });

  it("keeps the signal and case when the model is unavailable, and never falls back to the mock", async () => {
    const spy = vi.spyOn(MockProvider.prototype, "generateJson");
    const { rt, ingest } = await setup({ provider: down, timeoutMs: 1000, maxRetries: 1 });
    const res = await ingest(TRIM);
    expect(res.investigation?.status).toBe("created");
    expect(res.extraction).toMatchObject({ status: "unavailable", detail: "unreachable" });
    expect(await rt.repo.getSignal(T, res.outcome.signalId)).not.toBeNull();
    const failed = rt.db.events.find((e) => e.type === "extraction.failed")!;
    expect(failed).toMatchObject({ status: "failed", errorClass: "source_unavailable", retryCount: 0 });
    expect(rt.db.extractions[0]).toMatchObject({ status: "unavailable", fields: [], provider: "ollama" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("produces identical calculations and case state with and without AI", async () => {
    const withAi = await setup(MOCK_AI);
    const withoutAi = await setup(AI_OFF);
    const a = await withAi.ingest(TRIM);
    const b = await withoutAi.ingest(TRIM);
    const caseA = await withAi.rt.investigations.getCase(T, a.investigation!.caseId!);
    const caseB = await withoutAi.rt.investigations.getCase(T, b.investigation!.caseId!);
    // Timestamps differ between the two runs; everything else must be identical.
    const untimed = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (/At$/.test(k) ? undefined : x)));
    expect(untimed(caseA?.latest?.shortage)).toEqual(untimed(caseB?.latest?.shortage));
    expect(untimed(caseA?.latest?.deliveryRisk)).toEqual(untimed(caseB?.latest?.deliveryRisk));
    expect(untimed(caseA?.latest?.claims)).toEqual(untimed(caseB?.latest?.claims));
    expect(untimed(caseA?.case)).toEqual(untimed(caseB?.case));
  });

  it("skips duplicates, irrelevant and rejected submissions without calling a model", async () => {
    const generate = vi.fn(MockProvider.prototype.generateJson);
    const counting: AiProvider = { kind: "mock", model: "mock-extractor-1", label: "mock", generateJson: generate };
    const { ingest } = await setup({ provider: counting, timeoutMs: 1000, maxRetries: 0 });
    await ingest(TRIM);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await ingest(TRIM)).extraction).toMatchObject({ status: "skipped", detail: "duplicate" });
    expect((await ingest(ROUTINE)).extraction).toMatchObject({ status: "skipped", detail: "irrelevant" });
    const rejected = await ingestAndInvestigate(T, "{not json", (await setup()).deps);
    expect(rejected.extraction).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("reports failed when the result cannot be stored, without losing the signal", async () => {
    const { rt, ingest } = await setup();
    vi.spyOn(rt.extractions, "record").mockRejectedValueOnce(new Error("disk full"));
    const res = await ingest(TRIM);
    expect(res.extraction).toEqual({ status: "failed", extractionId: null, detail: "internal_error" });
    expect(await rt.repo.getSignal(T, res.outcome.signalId)).not.toBeNull();
  });
});

describe("backfillExtractions", () => {
  it("extracts eligible signals once per provider, model and prompt version", async () => {
    const { rt, ingest } = await setup(AI_OFF);
    await ingest(TRIM);
    await ingest(ROUTINE);
    rt.ai = MOCK_AI;
    const deps = depsOf(rt).extraction!;
    const first = await backfillExtractions(T, deps);
    expect(first.byStatus).toMatchObject({ completed: 1, skipped: 1 });
    const second = await backfillExtractions(T, deps);
    expect(second.byStatus.completed).toBe(0);
    expect(rt.db.extractions).toHaveLength(1);
  });

  it("stops at the first unavailable answer and reports disabled when AI is off", async () => {
    const { rt, ingest } = await setup(AI_OFF);
    await ingest(TRIM);
    await ingest({ ...TRIM, sourceRecordId: "msg-2", label: "Supplier notice: PO-77210 trim delayed three days" });
    expect((await backfillExtractions(T, depsOf(rt).extraction!)).byStatus.disabled).toBe(1);
    rt.ai = { provider: down, timeoutMs: 1000, maxRetries: 0 };
    const res = await backfillExtractions(T, depsOf(rt).extraction!);
    expect(res).toMatchObject({ examined: 1, byStatus: { unavailable: 1 } });
  });

  it("is tenant-scoped", async () => {
    const { rt, ingest } = await setup();
    const res = await ingest(TRIM);
    expect(await extractForSignal("tenant-other", res.outcome.signalId, depsOf(rt).extraction!)).toMatchObject({
      status: "skipped",
      detail: "not_found",
    });
  });
});
