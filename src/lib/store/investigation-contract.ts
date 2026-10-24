import { describe, expect, it } from "vitest";
import { investigateSignals, RULE_VERSIONS } from "@/lib/investigation/investigate";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import { toCaseSignal } from "@/lib/investigation/signals";
import { makeEventDraft, makeStored, TENANT_A, TENANT_B } from "./contract";
import { retrievalSummary, type InvestigationRepository, type StoredCase, type StoredRun } from "./investigation-types";
import { ForeignKeyViolationError, UniqueViolationError, type SignalRepository } from "./types";

export interface InvestigationHarness {
  signals: SignalRepository;
  investigations: InvestigationRepository;
  /** Reader over business records seeded for TENANT_A only. */
  reader: BusinessRecordReader;
  close?: () => Promise<void>;
}

const NOW = new Date("2026-10-24T09:05:00.000Z");

export function makeCase(id: string, tenantId: string, overrides: Partial<StoredCase> = {}): StoredCase {
  return {
    tenantId,
    id,
    title: "Supplier notice: navy twill delayed",
    summary: "Synthetic test case.",
    state: "needs_review",
    severity: "high",
    ownerName: "Unassigned",
    ownerRole: "Procurement",
    nextAction: "Confirm the delivery date.",
    requiresReview: true,
    reviewReason: "Shortage is provisional.",
    origin: "automatic",
    referenceKeys: { purchaseOrder: "PO-77410", material: "NV-4410" },
    latestRunId: null,
    openedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    dataMode: "synthetic",
    ...overrides,
  };
}

async function analysedRun(h: InvestigationHarness, caseId: string, signalId: string): Promise<StoredRun> {
  const stored = await h.signals.getSignal(TENANT_A, signalId);
  const signal = toCaseSignal(stored!);
  const runId = `RUN-${caseId}-1`;
  const result = await investigateSignals({
    tenantId: TENANT_A, caseId, runId, signals: signal ? [signal] : [], reader: h.reader, now: NOW, monotonicMs: () => 0,
  });
  return {
    tenantId: TENANT_A, id: runId, caseId, runNumber: 1, trigger: "signal", triggerSignalId: signalId,
    ruleVersions: { ...RULE_VERSIONS }, retrieval: retrievalSummary(result.accounting), entities: result.analysis.entities,
    startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(),
    evidence: result.analysis.evidence, claims: result.analysis.claims, unknowns: result.analysis.unknowns,
    conflicts: result.analysis.conflicts, shortage: result.analysis.shortage, deliveryRisk: result.analysis.deliveryRisk,
  };
}

const NAVY = {
  label: "Supplier notice: navy twill NV-4410 on PO-77410 arriving four days late",
  references: { purchaseOrder: "PO-77410", material: "NV-4410" },
  quantity: { value: 8000, unit: "m" as const },
};

/** Behaviour every InvestigationRepository must have. */
export function describeInvestigationContract(name: string, setup: () => Promise<InvestigationHarness>) {
  describe(`InvestigationRepository contract: ${name}`, () => {
    async function withSignal() {
      const h = await setup();
      await h.signals.ensureTenant(TENANT_A, "A");
      await h.signals.ensureTenant(TENANT_B, "B");
      await h.signals.transaction((tx) => tx.insertSignal(makeStored("SIG-1", TENANT_A, NAVY)));
      return h;
    }

    it("persists a case, its signal link and an immutable run, and reads them back", async () => {
      const h = await withSignal();
      const run = await analysedRun(h, "INV-1", "SIG-1");
      await h.investigations.transaction(async (tx) => {
        await tx.insertCase(makeCase("INV-1", TENANT_A));
        await tx.linkSignal(TENANT_A, { caseId: "INV-1", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() });
        await tx.insertRun(run);
        await tx.updateCase(makeCase("INV-1", TENANT_A, { latestRunId: run.id, severity: "critical" }));
        await tx.insertEvents(TENANT_A, [{ ...makeEventDraft("SIG-1", "corr-SIG-1", NOW.toISOString()), caseId: "INV-1", type: "investigation.created", stage: "case" }]);
      });

      const detail = await h.investigations.getCase(TENANT_A, "INV-1");
      expect(detail?.case.severity).toBe("critical");
      expect(detail?.links.map((l) => l.signalId)).toEqual(["SIG-1"]);
      expect(detail?.runs).toHaveLength(1);
      expect(detail?.runs[0]?.counts.evidence).toBe(run.evidence.length);
      expect(detail?.latest?.evidence).toEqual(run.evidence);
      expect(detail?.latest?.claims).toEqual(run.claims);
      expect(detail?.latest?.unknowns).toEqual(run.unknowns);
      expect(detail?.latest?.conflicts).toEqual(run.conflicts);
      expect(detail?.latest?.shortage).toEqual(run.shortage);
      expect(detail?.latest?.deliveryRisk).toEqual(run.deliveryRisk);
      expect(detail?.latest?.entities).toEqual(run.entities);
      expect(run.shortage?.deficit).toBe(5700);

      const list = await h.investigations.listCases(TENANT_A, { limit: 10 });
      expect(list.map((c) => c.case.id)).toEqual(["INV-1"]);
      expect(list[0]?.linkedSignals).toBe(1);
      expect(list[0]?.latest?.shortage?.deficit).toBe(5700);
      expect(list[0]?.latest?.claimStates).toEqual(run.claims.map((c) => c.state));
      expect(list[0]?.latest?.unknowns).toBe(run.unknowns.length);
      expect(list[0]?.latest?.conflicts).toBe(run.conflicts.length);
      expect((await h.investigations.listEvidence(TENANT_A, { limit: 50 })).map((e) => e.id).sort()).toEqual(run.evidence.map((e) => e.id).sort());

      expect((await h.signals.listSignals(TENANT_A, { limit: 5 }))[0]?.caseId).toBe("INV-1");
      expect((await h.signals.getSignal(TENANT_A, "SIG-1"))?.caseId).toBe("INV-1");
      expect(await h.investigations.caseIdsForSignals(TENANT_A, ["SIG-1", "SIG-404"])).toEqual({ "SIG-1": "INV-1" });
      expect(await h.investigations.openCaseReferences(TENANT_A)).toEqual([
        { caseId: "INV-1", references: { purchaseOrder: "PO-77410", material: "NV-4410" } },
      ]);
      await h.close?.();
    });

    it("isolates tenants", async () => {
      const h = await withSignal();
      await h.investigations.transaction(async (tx) => {
        await tx.insertCase(makeCase("INV-1", TENANT_A));
        await tx.linkSignal(TENANT_A, { caseId: "INV-1", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() });
      });
      expect(await h.investigations.getCase(TENANT_B, "INV-1")).toBeNull();
      expect(await h.investigations.listCases(TENANT_B, { limit: 10 })).toEqual([]);
      expect(await h.investigations.openCaseReferences(TENANT_B)).toEqual([]);
      expect(await h.investigations.caseIdsForSignals(TENANT_B, ["SIG-1"])).toEqual({});
      expect(await h.investigations.listEvidence(TENANT_B, { limit: 20 })).toEqual([]);
      // Tenant B cannot link tenant A's signal or case, or emit events against A's case.
      await h.investigations.transaction((tx) => tx.insertCase(makeCase("INV-2", TENANT_B)));
      await expect(
        h.investigations.transaction((tx) =>
          tx.linkSignal(TENANT_B, { caseId: "INV-2", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() })),
      ).rejects.toBeInstanceOf(ForeignKeyViolationError);
      await expect(
        h.investigations.transaction((tx) =>
          tx.insertEvents(TENANT_B, [{ ...makeEventDraft(null, "corr-x", NOW.toISOString()), caseId: "INV-1" }])),
      ).rejects.toBeInstanceOf(ForeignKeyViolationError);
      expect(await h.reader.purchaseOrder(TENANT_B, "PO-77410")).toBeNull();
      expect(await h.reader.inventory(TENANT_B, "NV-4410")).toEqual([]);
      await h.close?.();
    });

    it("links a signal to at most one case", async () => {
      const h = await withSignal();
      await h.investigations.transaction(async (tx) => {
        await tx.insertCase(makeCase("INV-1", TENANT_A));
        await tx.insertCase(makeCase("INV-2", TENANT_A));
        await tx.linkSignal(TENANT_A, { caseId: "INV-1", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() });
      });
      await expect(
        h.investigations.transaction((tx) =>
          tx.linkSignal(TENANT_A, { caseId: "INV-2", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() })),
      ).rejects.toBeInstanceOf(UniqueViolationError);
      await h.close?.();
    });

    it("rolls back the whole transaction on error", async () => {
      const h = await withSignal();
      await expect(
        h.investigations.transaction(async (tx) => {
          await tx.insertCase(makeCase("INV-1", TENANT_A));
          await tx.linkSignal(TENANT_A, { caseId: "INV-1", signalId: "SIG-1", linkReason: "origin", linkedAt: NOW.toISOString() });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await h.investigations.listCases(TENANT_A, { limit: 10 })).toEqual([]);
      expect((await h.signals.getSignal(TENANT_A, "SIG-1"))?.caseId).toBeNull();

      await h.investigations.transaction((tx) => tx.insertCase(makeCase("INV-1", TENANT_A)));
      await expect(
        h.investigations.transaction(async (tx) => {
          await tx.updateCase(makeCase("INV-1", TENANT_A, { state: "resolved" }));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect((await h.investigations.getCase(TENANT_A, "INV-1"))?.case.state).toBe("needs_review");
      await h.close?.();
    });

    it("numbers runs per case and excludes closed cases from the open index", async () => {
      const h = await withSignal();
      await h.investigations.transaction(async (tx) => {
        await tx.insertCase(makeCase("INV-1", TENANT_A, { state: "resolved" }));
        expect(await tx.nextRunNumber(TENANT_A, "INV-1")).toBe(1);
      });
      expect(await h.investigations.openCaseReferences(TENANT_A)).toEqual([]);
      const run = await analysedRun(h, "INV-1", "SIG-1");
      await h.investigations.transaction((tx) => tx.insertRun(run));
      await expect(h.investigations.transaction((tx) => tx.insertRun(run))).rejects.toBeInstanceOf(UniqueViolationError);
      await h.investigations.transaction(async (tx) => expect(await tx.nextRunNumber(TENANT_A, "INV-1")).toBe(2));
      await h.close?.();
    });
  });
}
