import { describe, expect, it } from "vitest";
import { makeCase } from "@/lib/store/investigation-contract";
import { memoryRuntime } from "@/test/memory-runtime";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { parameterDigest } from "./digest";
import { proposeActions, syncProposedActions } from "./propose";
import { approveAction, rejectAction } from "./approve";
import { executeSynthetic } from "./execute";
import { recordOutcomeObservation } from "./verify";
import { AuthorizationDeniedError, StaleApprovalError } from "./errors";
import type { SessionUser } from "@/lib/auth/session";
import type { Conflict, UnknownItem } from "@/lib/domain";

const reviewer: SessionUser = {
  userId: "USR-REVIEWER", tenantId: "tenant-demo", role: "reviewer", displayName: "Demo reviewer", email: "reviewer@demo.local",
};
const procurement: SessionUser = {
  userId: "USR-PROCUREMENT", tenantId: "tenant-demo", role: "procurement", displayName: "Demo procurement", email: "procurement@demo.local",
};
const manager: SessionUser = {
  userId: "USR-MANAGER", tenantId: "tenant-demo", role: "manager", displayName: "Demo manager", email: "manager@demo.local",
};

const dateConflict: Conflict = {
  id: "c1", caseId: "INV-1", description: "Linked signals state different delay lengths (4 vs 2 days).",
  sides: [], dataMode: "synthetic",
};
const qcUnknown: UnknownItem = {
  id: "u1", caseId: "INV-1", description: "Quality-release status of the on-hand stock",
  whyItMatters: "Stock that is not quality-released cannot be used.",
  suggestedRetrieval: "Ask quality control whether the stock is released.", dataMode: "synthetic",
};

describe("propose-actions.v1", () => {
  it("suggests a procurement date action and a reviewer retrieval action from the latest analysis", () => {
    const drafts = proposeActions({
      caseId: "INV-1",
      referenceKeys: { purchaseOrder: "PO-77410", material: "NV-4410", shipment: "SHP-40110" },
      conflicts: [dateConflict],
      unknowns: [qcUnknown],
    });
    expect(drafts.map((d) => [d.id, d.requiredRole])).toEqual([
      ["INV-1-ASK-DATE", "procurement"],
      ["INV-1-RETRIEVE-QC", "reviewer"],
    ]);
  });

  it("increments version when parameters change", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) => tx.insertCase(makeCase("INV-1", "tenant-demo")));
    const first = await syncProposedActions({
      tenantId: "tenant-demo",
      stored: makeCase("INV-1", "tenant-demo"),
      conflicts: [dateConflict],
      unknowns: [],
      governance: runtime.governance,
      updateCase: (c) => runtime.investigations.transaction((tx) => tx.updateCase(c)),
      now: new Date("2026-10-24T09:00:00.000Z"),
    });
    expect(first[0]?.version).toBe(1);
    const second = await syncProposedActions({
      tenantId: "tenant-demo",
      stored: makeCase("INV-1", "tenant-demo", { referenceKeys: { purchaseOrder: "PO-CHANGED" } }),
      conflicts: [dateConflict],
      unknowns: [],
      governance: runtime.governance,
      updateCase: (c) => runtime.investigations.transaction((tx) => tx.updateCase(c)),
      now: new Date("2026-10-24T10:00:00.000Z"),
    });
    expect(second[0]?.version).toBe(2);
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("awaiting_approval");
  });
});

describe("approval and synthetic execution", () => {
  async function prepared() {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) =>
      tx.insertCase(makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" })),
    );
    const [row] = await syncProposedActions({
      tenantId: "tenant-demo",
      stored: makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" }),
      conflicts: [dateConflict],
      unknowns: [],
      governance: runtime.governance,
      updateCase: (c) => runtime.investigations.transaction((tx) => tx.updateCase(c)),
      now: new Date("2026-10-24T09:00:00.000Z"),
    });
    return { runtime, action: row! };
  }

  it("rejects a reviewer on a procurement action and a stale version", async () => {
    const { runtime, action } = await prepared();
    await expect(
      approveAction({
        tenantId: "tenant-demo", input: { actionId: action.id, version: action.version, digest: action.parameterDigest },
        actor: reviewer, governance: runtime.governance, investigations: runtime.investigations, now: new Date(),
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      approveAction({
        tenantId: "tenant-demo", input: { actionId: action.id, version: action.version + 1, digest: action.parameterDigest },
        actor: procurement, governance: runtime.governance, investigations: runtime.investigations, now: new Date(),
      }),
    ).rejects.toBeInstanceOf(StaleApprovalError);
    await expect(
      approveAction({
        tenantId: "tenant-demo", input: { actionId: action.id, version: action.version, digest: "c".repeat(64) },
        actor: procurement, governance: runtime.governance, investigations: runtime.investigations, now: new Date(),
      }),
    ).rejects.toBeInstanceOf(StaleApprovalError);
  });

  it("approves, executes without sending or changing business rows, and leaves the outcome unverified", async () => {
    const { runtime, action } = await prepared();
    const beforeInv = await runtime.reader.inventory("tenant-demo", "NV-4410");
    await approveAction({
      tenantId: "tenant-demo", input: { actionId: action.id, version: action.version, digest: action.parameterDigest },
      actor: procurement, governance: runtime.governance, investigations: runtime.investigations,
      now: new Date("2026-10-24T09:10:00.000Z"),
    });
    const executed = await executeSynthetic({
      tenantId: "tenant-demo", actionId: action.id, version: action.version, actor: procurement,
      governance: runtime.governance, investigations: runtime.investigations, reader: runtime.reader,
      now: new Date("2026-10-24T09:11:00.000Z"),
    });
    expect(executed.status).toBe("executed");
    const afterInv = await runtime.reader.inventory("tenant-demo", "NV-4410");
    expect(afterInv).toEqual(beforeInv);
    const events = await runtime.repo.listEvents("tenant-demo", { limit: 50 });
    expect(events.some((e) => e.type === "action.execution_completed" && e.metadata.sent === false)).toBe(true);
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("awaiting_verification");
    const check = await recordOutcomeObservation({
      tenantId: "tenant-demo", caseId: "INV-1", actionId: action.id, actor: manager, markVerified: false,
      governance: runtime.governance, investigations: runtime.investigations, reader: runtime.reader,
      now: new Date("2026-10-24T09:12:00.000Z"),
    });
    expect(check.matched).toBe(false);
    expect(check.summary).toMatch(/unchanged/);
    await expect(
      recordOutcomeObservation({
        tenantId: "tenant-demo", caseId: "INV-1", actionId: action.id, actor: manager, markVerified: true,
        governance: runtime.governance, investigations: runtime.investigations, reader: runtime.reader,
        now: new Date("2026-10-24T09:13:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("awaiting_verification");
  });

  it("lets a manager verify only after source records change", async () => {
    const { runtime, action } = await prepared();
    await approveAction({
      tenantId: "tenant-demo", input: { actionId: action.id, version: action.version, digest: action.parameterDigest },
      actor: manager, governance: runtime.governance, investigations: runtime.investigations, now: new Date(),
    });
    await executeSynthetic({
      tenantId: "tenant-demo", actionId: action.id, version: action.version, actor: manager,
      governance: runtime.governance, investigations: runtime.investigations, reader: runtime.reader, now: new Date(),
    });
    const dataset = (await import("@/lib/investigation/seed-records")).syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z"));
    dataset.balances = dataset.balances.map((b) => (b.materialId === "NV-4410" ? { ...b, onHand: b.onHand + 25 } : b));
    (runtime.reader as InMemoryBusinessRecordReader).load("tenant-demo", dataset, "2026-10-24T12:00:00.000Z");
    const verified = await recordOutcomeObservation({
      tenantId: "tenant-demo", caseId: "INV-1", actionId: action.id, actor: manager, markVerified: true,
      governance: runtime.governance, investigations: runtime.investigations, reader: runtime.reader,
      now: new Date("2026-10-24T12:01:00.000Z"),
    });
    expect(verified.matched).toBe(true);
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("resolved");
    expect((await runtime.repo.listEvents("tenant-demo", { limit: 50 })).some((e) => e.type === "outcome.verified")).toBe(true);
  });

  it("rejects an action without changing state", async () => {
    const { runtime, action } = await prepared();
    await rejectAction({
      tenantId: "tenant-demo", actionId: action.id, version: action.version, digest: action.parameterDigest,
      rationale: "Need a better option.", actor: procurement, governance: runtime.governance,
      investigations: runtime.investigations, now: new Date(),
    });
    expect((await runtime.governance.getAction("tenant-demo", action.id))?.status).toBe("rejected");
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("needs_review");
  });

  it("rejects a reviewer retrieval action that is already in needs_review", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) => tx.insertCase(makeCase("INV-1", "tenant-demo", { state: "needs_review" })));
    const [row] = await syncProposedActions({
      tenantId: "tenant-demo",
      stored: makeCase("INV-1", "tenant-demo", { state: "needs_review" }),
      conflicts: [],
      unknowns: [qcUnknown],
      governance: runtime.governance,
      updateCase: (c) => runtime.investigations.transaction((tx) => tx.updateCase(c)),
      now: new Date("2026-10-24T09:00:00.000Z"),
    });
    await rejectAction({
      tenantId: "tenant-demo", actionId: row!.id, version: row!.version, digest: row!.parameterDigest,
      rationale: "Not needed.", actor: reviewer, governance: runtime.governance,
      investigations: runtime.investigations, now: new Date("2026-10-24T09:05:00.000Z"),
    });
    expect((await runtime.governance.getAction("tenant-demo", row!.id))?.status).toBe("rejected");
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("needs_review");
  });
});

describe("parameter digest", () => {
  it("is stable under reordering and changes when a value changes", () => {
    const a = parameterDigest([{ label: "B", value: "2" }, { label: "A", value: "1" }]);
    const b = parameterDigest([{ label: "A", value: "1" }, { label: "B", value: "2" }]);
    expect(a).toBe(b);
    expect(parameterDigest([{ label: "A", value: "9" }, { label: "B", value: "2" }])).not.toBe(a);
  });
});
