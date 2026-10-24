import { describe, expect, it } from "vitest";
import type { EventDraft, SignalRepository, StoredSignal } from "./types";
import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import { normalizeSignal } from "@/lib/ingestion/normalize";
import { contentHash, fingerprint } from "@/lib/ingestion/hash";
import { makeInput } from "@/lib/ingestion/test-helpers";
import type { SignalInput } from "@/lib/domain/signal-input";

export const TENANT_A = "tenant-a";
export const TENANT_B = "tenant-b";

export function makeStored(
  id: string,
  tenantId: string,
  inputOverrides: Partial<SignalInput> = {},
  overrides: Partial<StoredSignal> = {},
): StoredSignal {
  const input = makeInput(inputOverrides);
  const normalized = normalizeSignal(input);
  return {
    id,
    tenantId,
    correlationId: `corr-${id}`,
    receivedAt: "2026-10-24T09:00:00.000Z",
    sourceType: normalized.sourceType,
    sourceSystem: normalized.sourceSystem,
    label: normalized.label,
    processingStatus: "triaged",
    dedupeStatus: "unique",
    duplicateOf: null,
    revisionOf: null,
    triageOutcome: "relevant",
    reasonCodes: ["delay_language_with_po"],
    requiresReview: false,
    ruleVersion: "triage.v1",
    caseId: null,
    dataMode: "synthetic",
    sourceRecordId: normalized.sourceRecordId,
    normalized,
    raw: input,
    contentHash: contentHash(normalized),
    fingerprint: fingerprint(normalized),
    dedupeRule: "dedupe.v1/unique",
    possiblyRelated: [],
    relatedCaseIds: [],
    triage: {
      outcome: "relevant",
      ruleId: "triage.v1/relevant.delay-with-po",
      ruleVersion: "triage.v1",
      reasonCodes: ["delay_language_with_po"],
      requiresReview: false,
      relatedCaseIds: [],
    },
    rejection: null,
    ...overrides,
  };
}

export function makeEventDraft(signalId: string | null, correlationId: string, at: string, overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    caseId: null,
    signalId,
    correlationId,
    type: "signal.received",
    stage: "received",
    status: "completed",
    occurredAt: at,
    durationMs: 3,
    method: { kind: "system", name: "ingest" },
    retryCount: 0,
    errorClass: null,
    metadata: { sourceType: "supplier_email" },
    dataMode: "synthetic",
    ...overrides,
  };
}

/**
 * Behavior every SignalRepository must satisfy. Run against the in-memory implementation always, and against
 * Postgres (PGlite, and a real database when TEST_DATABASE_URL is set).
 */
export function describeSignalRepositoryContract(name: string, create: () => Promise<{ repo: SignalRepository; close?: () => Promise<void> }>) {
  async function fresh() {
    const ctx = await create();
    await ctx.repo.ensureTenant(TENANT_A, "Tenant A (synthetic)");
    await ctx.repo.ensureTenant(TENANT_B, "Tenant B (synthetic)");
    return ctx;
  }

  describe(`SignalRepository contract: ${name}`, () => {
    it("ensureTenant is idempotent", async () => {
      const { repo, close } = await fresh();
      await expect(repo.ensureTenant(TENANT_A, "Again")).resolves.toBeUndefined();
      await close?.();
    });

    it("round-trips a signal and keeps raw separate from normalized", async () => {
      const { repo, close } = await fresh();
      const stored = makeStored("SIG-1", TENANT_A, { sourceRecordId: "msg-1" });
      await repo.transaction((tx) => tx.insertSignal(stored));
      const read = await repo.getSignal(TENANT_A, "SIG-1");
      expect(read?.normalized?.sourceRecordId).toBe("MSG-1");
      expect((read?.raw as { sourceRecordId: string }).sourceRecordId).toBe("msg-1"); // original casing preserved
      expect(read?.triage?.ruleId).toBe("triage.v1/relevant.delay-with-po");
      const list = await repo.listSignals(TENANT_A, { limit: 10 });
      expect(list.map((s) => s.id)).toEqual(["SIG-1"]);
      expect(list[0]).not.toHaveProperty("raw");
      expect(list[0]).not.toHaveProperty("normalized");
      await close?.();
    });

    it("rolls back the signal and its events together when the transaction fails", async () => {
      const { repo, close } = await fresh();
      await expect(
        repo.transaction(async (tx) => {
          await tx.insertSignal(makeStored("SIG-1", TENANT_A));
          await tx.insertEvents(TENANT_A, [makeEventDraft("SIG-1", "corr-SIG-1", "2026-10-24T09:00:00.000Z")]);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await repo.getSignal(TENANT_A, "SIG-1")).toBeNull();
      expect(await repo.listEvents(TENANT_A, { limit: 10 })).toEqual([]);
      await close?.();
    });

    it("stores events with increasing sequence and lists them newest first", async () => {
      const { repo, close } = await fresh();
      await repo.transaction(async (tx) => {
        await tx.insertSignal(makeStored("SIG-1", TENANT_A));
        await tx.insertEvents(TENANT_A, [
          makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:00.000Z"),
          makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:00.000Z", { type: "signal.validated", stage: "validated" }),
          makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:01.000Z", { type: "triage.completed", stage: "triaged" }),
        ]);
      });
      const events = await repo.listEvents(TENANT_A, { limit: 10 });
      expect(events.map((e) => e.type)).toEqual(["triage.completed", "signal.validated", "signal.received"]);
      expect(events[1]!.sequence).toBeGreaterThan(events[2]!.sequence);
      expect(events[0]!.method).toEqual({ kind: "system", name: "ingest" });
      expect(events[0]!.tenantId).toBe(TENANT_A);
      const byCorrelation = await repo.listEvents(TENANT_A, { limit: 10, correlationId: "corr-none" });
      expect(byCorrelation).toEqual([]);
      await close?.();
    });

    it("never returns another tenant's signals, events or dedupe candidates", async () => {
      const { repo, close } = await fresh();
      await repo.transaction(async (tx) => {
        await tx.insertSignal(makeStored("SIG-1", TENANT_A, { sourceRecordId: "msg-1" }));
        await tx.insertEvents(TENANT_A, [makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:00.000Z")]);
      });
      expect(await repo.listSignals(TENANT_B, { limit: 10 })).toEqual([]);
      expect(await repo.getSignal(TENANT_B, "SIG-1")).toBeNull();
      expect(await repo.listEvents(TENANT_B, { limit: 10 })).toEqual([]);
      expect(await repo.listEvents(TENANT_B, { limit: 10, correlationId: "corr-1" })).toEqual([]);
      const probe = makeStored("x", TENANT_A, { sourceRecordId: "msg-1" });
      await repo.transaction(async (tx) => {
        expect(await tx.findCanonicalByRecord(TENANT_B, probe.sourceSystem!, "MSG-1")).toEqual([]);
        expect(await tx.findCanonicalByFingerprint(TENANT_B, probe.fingerprint!)).toEqual([]);
        expect(await tx.findCanonicalByReferences(TENANT_B, { purchaseOrder: "PO-88001" }, 5)).toEqual([]);
        expect(await tx.findCanonicalByRecord(TENANT_A, probe.sourceSystem!, "MSG-1")).toHaveLength(1);
      });
      await close?.();
    });

    it("refuses an event that points at another tenant's signal", async () => {
      const { repo, close } = await fresh();
      await repo.transaction((tx) => tx.insertSignal(makeStored("SIG-1", TENANT_A)));
      await expect(
        repo.transaction((tx) => tx.insertEvents(TENANT_B, [makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:00.000Z")])),
      ).rejects.toBeInstanceOf(ForeignKeyViolationError);
      await close?.();
    });

    it("refuses writes for an unknown tenant", async () => {
      const { repo, close } = await fresh();
      await expect(repo.transaction((tx) => tx.insertSignal(makeStored("SIG-1", "tenant-missing")))).rejects.toBeInstanceOf(
        ForeignKeyViolationError,
      );
      await close?.();
    });

    it("allows only one canonical row per record id and content", async () => {
      const { repo, close } = await fresh();
      await repo.transaction((tx) => tx.insertSignal(makeStored("SIG-1", TENANT_A, { sourceRecordId: "msg-1" })));
      await expect(
        repo.transaction((tx) => tx.insertSignal(makeStored("SIG-2", TENANT_A, { sourceRecordId: "msg-1" }))),
      ).rejects.toBeInstanceOf(UniqueViolationError);
      // A linked duplicate row is allowed.
      await repo.transaction((tx) =>
        tx.insertSignal(
          makeStored("SIG-3", TENANT_A, { sourceRecordId: "msg-1" }, {
            processingStatus: "duplicate",
            dedupeStatus: "duplicate",
            duplicateOf: "SIG-1",
            triage: null,
            triageOutcome: null,
            reasonCodes: [],
            ruleVersion: null,
          }),
        ),
      );
      expect((await repo.listSignals(TENANT_A, { limit: 10 })).map((s) => s.id).sort()).toEqual(["SIG-1", "SIG-3"]);
      // The same record id in another tenant is independent.
      await repo.transaction((tx) => tx.insertSignal(makeStored("SIG-4", TENANT_B, { sourceRecordId: "msg-1" })));
      await close?.();
    });

    it("finds canonical signals by record, fingerprint and shared reference, and excludes duplicates", async () => {
      const { repo, close } = await fresh();
      const first = makeStored("SIG-1", TENANT_A);
      await repo.transaction(async (tx) => {
        await tx.insertSignal(first);
        await tx.insertSignal(
          makeStored("SIG-2", TENANT_A, {}, { processingStatus: "duplicate", dedupeStatus: "duplicate", duplicateOf: "SIG-1", triage: null, triageOutcome: null, reasonCodes: [], ruleVersion: null }),
        );
      });
      await repo.transaction(async (tx) => {
        const byFp = await tx.findCanonicalByFingerprint(TENANT_A, first.fingerprint!);
        expect(byFp.map((r) => r.id)).toEqual(["SIG-1"]);
        const byRef = await tx.findCanonicalByReferences(TENANT_A, { purchaseOrder: "PO-88001" }, 5);
        expect(byRef.map((r) => r.id)).toEqual(["SIG-1"]);
        expect(await tx.findCanonicalByReferences(TENANT_A, { purchaseOrder: "PO-00000" }, 5)).toEqual([]);
        expect(await tx.findCanonicalByReferences(TENANT_A, {}, 5)).toEqual([]);
      });
      await close?.();
    });

    it("stores a rejected submission without payload", async () => {
      const { repo, close } = await fresh();
      const rejected: StoredSignal = {
        ...makeStored("SIG-9", TENANT_A),
        processingStatus: "rejected",
        sourceType: null, sourceSystem: null, label: null, sourceRecordId: null,
        normalized: null, raw: null, contentHash: null, fingerprint: null,
        dedupeStatus: null, dedupeRule: null, triage: null, triageOutcome: null,
        reasonCodes: [], ruleVersion: null,
        rejection: { issues: [{ path: "label", code: "too_big" }], payloadBytes: 321, payloadSha256: "a".repeat(64) },
      };
      await repo.transaction((tx) => tx.insertSignal(rejected));
      const read = await repo.getSignal(TENANT_A, "SIG-9");
      expect(read?.processingStatus).toBe("rejected");
      expect(read?.raw).toBeNull();
      expect(read?.rejection?.issues).toEqual([{ path: "label", code: "too_big" }]);
      await close?.();
    });

    it("bounds list sizes", async () => {
      const { repo, close } = await fresh();
      await repo.transaction(async (tx) => {
        for (let i = 1; i <= 3; i++) {
          await tx.insertSignal(makeStored(`SIG-${i}`, TENANT_A, { label: `Delay notice ${i}` }, { receivedAt: `2026-10-24T09:0${i}:00.000Z` }));
        }
      });
      expect((await repo.listSignals(TENANT_A, { limit: 2 })).map((s) => s.id)).toEqual(["SIG-3", "SIG-2"]);
      await close?.();
    });
  });
}
