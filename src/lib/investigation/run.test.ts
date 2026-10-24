import { describe, expect, it } from "vitest";
import { processSignal, type Clock } from "@/lib/ingestion/pipeline";
import { makeRaw } from "@/lib/ingestion/test-helpers";
import { InMemoryInvestigationRepository, InMemorySignalRepository, MemoryDb } from "@/lib/store/memory";
import type { BusinessRecordReader } from "./reader";
import { backfillInvestigations, investigateSignal, InvestigationNotFoundError, reinvestigateCase, type InvestigationDeps } from "./run";
import { NOW, seededReader, TENANT } from "./test-helpers";

function clock(): Clock {
  let ms = 0;
  return { now: () => new Date(NOW.getTime() + ms * 1000), monotonicMs: () => (ms += 1) };
}

async function setup(reader: BusinessRecordReader = seededReader()) {
  const db = new MemoryDb();
  const signals = new InMemorySignalRepository(db);
  const investigations = new InMemoryInvestigationRepository(db);
  await signals.ensureTenant(TENANT, "A");
  await signals.ensureTenant("tenant-b", "B");
  const c = clock();
  const deps: InvestigationDeps = { signals, investigations, reader, clock: c };
  const caseIndex = { openCases: () => investigations.openCaseReferences(TENANT) };
  const ingest = async (overrides: Parameters<typeof makeRaw>[0]) => {
    const outcome = await processSignal(TENANT, makeRaw(overrides), { repo: signals, caseIndex, clock: c });
    return outcome.signalId;
  };
  return { db, deps, signals, investigations, ingest };
}

const TRIM = {
  label: "Supplier notice: PO-77210 trim delivery delayed two days",
  references: { purchaseOrder: "PO-77210", material: "TR-5502" },
  quantity: { value: 1200, unit: "m" as const },
  sourceRecordId: "msg-1",
};

describe("investigateSignal", () => {
  it("creates a case with an immutable run and real events for a relevant signal", async () => {
    const { deps, signals, investigations, ingest, db } = await setup();
    const id = await ingest(TRIM);
    const outcome = await investigateSignal(TENANT, id, deps);
    expect(outcome).toMatchObject({ status: "created", caseId: "INV-3001", runId: "INV-3001-R1" });

    const detail = await investigations.getCase(TENANT, "INV-3001");
    expect(detail?.case.origin).toBe("automatic");
    expect(detail?.links).toEqual([expect.objectContaining({ signalId: id, linkReason: "origin" })]);
    expect(detail?.latest?.shortage).toMatchObject({ status: "verified", deficit: 850 });
    expect(detail?.runs[0]?.trigger).toBe("signal");
    expect((await signals.getSignal(TENANT, id))?.caseId).toBe("INV-3001");

    const types = db.events.filter((e) => e.caseId === "INV-3001").map((e) => e.type);
    expect(types).toEqual(["evidence.retrieved", "impact.calculated", "investigation.created"]);
    const correlation = (await signals.getSignal(TENANT, id))?.correlationId;
    expect(db.events.filter((e) => e.caseId === "INV-3001").every((e) => e.correlationId === correlation && e.signalId === id)).toBe(true);
    expect(db.events.find((e) => e.type === "evidence.retrieved")?.metadata).toMatchObject({ actor: "system", truncated: false });
  });

  it("attaches a related signal to the open case and appends a run", async () => {
    const { deps, investigations, ingest, db } = await setup();
    await investigateSignal(TENANT, await ingest(TRIM), deps);
    const revision = await ingest({ ...TRIM, excerpt: "Update from supplier: the delay is now five days." });
    const outcome = await investigateSignal(TENANT, revision, deps);
    expect(outcome).toMatchObject({ status: "updated", caseId: "INV-3001", runId: "INV-3001-R2" });
    const detail = await investigations.getCase(TENANT, "INV-3001");
    expect(detail?.runs.map((r) => [r.runNumber, r.trigger])).toEqual([[2, "related_signal"], [1, "signal"]]);
    expect(detail?.latest?.conflicts.length).toBeGreaterThan(0);
    expect(detail?.case.state).toBe("needs_review");
    expect(db.events.filter((e) => e.type === "investigation.needs_review")).toHaveLength(1);
    expect(await investigations.listCases(TENANT, { limit: 10 })).toHaveLength(1);
  });

  it("holds uncertain signals until an operator opens an investigation", async () => {
    const { deps, investigations, ingest, db } = await setup();
    const id = await ingest({
      label: "Possible schedule change for lining PO-77305",
      references: { purchaseOrder: "PO-77305", material: "LN-2210" },
      quantity: undefined,
      sourceRecordId: "msg-2",
    });
    expect(await investigateSignal(TENANT, id, deps)).toMatchObject({ status: "held", caseId: null });
    expect(await investigations.listCases(TENANT, { limit: 10 })).toEqual([]);

    const opened = await investigateSignal(TENANT, id, deps, { operator: true });
    expect(opened.status).toBe("created");
    const detail = await investigations.getCase(TENANT, opened.caseId!);
    expect(detail?.case.origin).toBe("operator");
    expect(detail?.links[0]?.linkReason).toBe("operator_opened");
    expect(detail?.runs[0]?.trigger).toBe("operator_open");
    expect(db.events.find((e) => e.type === "investigation.created")?.metadata.actor).toBe("system");
  });

  it("skips irrelevant and duplicate signals", async () => {
    const { deps, ingest } = await setup();
    const irrelevant = await ingest({
      sourceType: "inventory_balance",
      label: "Routine stock sync",
      references: { material: "TR-5502" },
      quantity: undefined,
      sourceRecordId: "sync-3",
      attributes: { routineSync: true, varianceDetected: false },
    });
    expect((await investigateSignal(TENANT, irrelevant, deps)).status).toBe("skipped");
    await ingest(TRIM);
    const dup = await ingest(TRIM);
    expect((await investigateSignal(TENANT, dup, deps)).status).toBe("skipped");
  });

  it("keeps the signal and records a failed evidence event when retrieval fails", async () => {
    const reader = new Proxy(seededReader(), {
      get: (target, prop) =>
        prop === "purchaseOrder"
          ? () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))
          : Reflect.get(target, prop),
    });
    const { deps, signals, investigations, ingest, db } = await setup(reader);
    const id = await ingest(TRIM);
    const outcome = await investigateSignal(TENANT, id, deps);
    expect(outcome).toMatchObject({ status: "failed", caseId: null, detail: "source_unavailable" });
    expect(await signals.getSignal(TENANT, id)).not.toBeNull();
    expect(await investigations.listCases(TENANT, { limit: 10 })).toEqual([]);
    const failed = db.events.find((e) => e.type === "evidence.retrieved");
    expect(failed).toMatchObject({ status: "failed", errorClass: "source_unavailable", signalId: id, caseId: null });
  });

  it("classifies other failures as internal errors", async () => {
    const reader = new Proxy(seededReader(), {
      get: (target, prop) => (prop === "inventory" ? () => Promise.reject(new TypeError("bad row")) : Reflect.get(target, prop)),
    });
    const { deps, ingest, db } = await setup(reader);
    expect((await investigateSignal(TENANT, await ingest(TRIM), deps)).detail).toBe("internal_error");
    expect(db.events.find((e) => e.type === "evidence.retrieved")?.errorClass).toBe("internal_error");
  });

  it("refuses another tenant's signal", async () => {
    const { deps, ingest } = await setup();
    const id = await ingest(TRIM);
    await expect(investigateSignal("tenant-b", id, deps)).rejects.toBeInstanceOf(InvestigationNotFoundError);
  });
});

describe("reinvestigateCase and backfill", () => {
  it("appends a new run without rewriting the previous one", async () => {
    const { deps, investigations, ingest } = await setup();
    await investigateSignal(TENANT, await ingest(TRIM), deps);
    const before = await investigations.getCase(TENANT, "INV-3001");
    const outcome = await reinvestigateCase(TENANT, "INV-3001", deps);
    expect(outcome).toMatchObject({ status: "updated", runId: "INV-3001-R2" });
    const after = await investigations.getCase(TENANT, "INV-3001");
    expect(after?.runs.map((r) => r.trigger)).toEqual(["operator_rerun", "signal"]);
    expect(after?.runs[1]).toEqual(before?.runs[0]);
    await expect(reinvestigateCase("tenant-b", "INV-3001", deps)).rejects.toBeInstanceOf(InvestigationNotFoundError);
  });

  it("backfills oldest first so a revision attaches to its original's case, and is idempotent", async () => {
    const { deps, investigations, ingest } = await setup();
    await ingest(TRIM);
    await ingest({ ...TRIM, excerpt: "Update from supplier: the delay is now five days." });
    await ingest({ label: "Possible schedule change for lining PO-77305", references: { purchaseOrder: "PO-77305" }, quantity: undefined, sourceRecordId: "msg-2" });
    const first = await backfillInvestigations(TENANT, deps);
    expect(first.byStatus).toMatchObject({ created: 1, updated: 1, held: 1 });
    const cases = await investigations.listCases(TENANT, { limit: 10 });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.linkedSignals).toBe(2);
    const second = await backfillInvestigations(TENANT, deps);
    expect(second.byStatus).toMatchObject({ created: 0, updated: 0, held: 1 });
  });
});
