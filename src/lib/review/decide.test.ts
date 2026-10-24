import { describe, expect, it } from "vitest";
import { makeCase } from "@/lib/store/investigation-contract";
import { memoryRuntime } from "@/test/memory-runtime";
import type { SessionUser } from "@/lib/auth/session-crypto";
import { AuthorizationDeniedError } from "@/lib/actions/errors";
import { recordReviewDecision } from "./decide";

const reviewer: SessionUser = {
  userId: "USR-REVIEWER",
  tenantId: "tenant-demo",
  role: "reviewer",
  displayName: "Demo reviewer",
  email: "reviewer@demo.local",
};

describe("recordReviewDecision", () => {
  it("does not persist a decision that the case state cannot accept", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) =>
      tx.insertCase(makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" })),
    );
    await expect(
      recordReviewDecision({
        tenantId: "tenant-demo",
        caseId: "INV-1",
        decision: "dismiss",
        rationale: "Not this case.",
        actor: reviewer,
        governance: runtime.governance,
        investigations: runtime.investigations,
        now: new Date("2026-10-24T11:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(await runtime.governance.listDecisionsForCase("tenant-demo", "INV-1")).toEqual([]);
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("awaiting_approval");
  });

  it("returns an awaiting-approval case to needs_review when more evidence is requested", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) =>
      tx.insertCase(makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" })),
    );
    await recordReviewDecision({
      tenantId: "tenant-demo",
      caseId: "INV-1",
      decision: "request_evidence",
      rationale: "Need the quality release.",
      actor: reviewer,
      governance: runtime.governance,
      investigations: runtime.investigations,
      now: new Date("2026-10-24T11:00:00.000Z"),
    });
    expect((await runtime.investigations.getCase("tenant-demo", "INV-1"))?.case.state).toBe("needs_review");
  });

  it("resolves a needs_review case on acknowledge and records the signed-in actor", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    await runtime.investigations.transaction((tx) => tx.insertCase(makeCase("INV-1", "tenant-demo")));
    await recordReviewDecision({
      tenantId: "tenant-demo",
      caseId: "INV-1",
      decision: "acknowledge",
      rationale: "Shortage is covered.",
      actor: reviewer,
      governance: runtime.governance,
      investigations: runtime.investigations,
      now: new Date("2026-10-24T11:00:00.000Z"),
    });
    const detail = await runtime.investigations.getCase("tenant-demo", "INV-1");
    expect(detail?.case.state).toBe("resolved");
    const events = await runtime.repo.listEvents("tenant-demo", { limit: 20 });
    expect(events.find((e) => e.type === "review.completed")?.metadata).toMatchObject({
      actor: "Demo reviewer",
      actorUserId: "USR-REVIEWER",
    });
  });
});
