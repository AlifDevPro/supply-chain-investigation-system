import { beforeEach, describe, expect, it, vi } from "vitest";
import { FixedWindowRateLimiter } from "@/lib/ingestion/rate-limit";
import { makeRaw } from "@/lib/ingestion/test-helpers";
import { processSignal } from "@/lib/ingestion/pipeline";
import type { Runtime } from "@/lib/runtime";
import { depsOf, memoryRuntime } from "@/test/memory-runtime";
import { OPERATOR_IDLE } from "./operator-state";

const env = { DATA_SOURCE: "memory", ENABLE_OPERATOR_ACTIONS: true, DEMO_TENANT_ID: "tenant-demo" };
const ctx: { runtime: Runtime | null; limiter: FixedWindowRateLimiter } = { runtime: null, limiter: new FixedWindowRateLimiter(10, 60_000) };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({
    userId: "USR-MANAGER",
    tenantId: "tenant-demo",
    role: "manager",
    displayName: "Demo manager",
    email: "manager@demo.local",
  }),
  SessionError: class SessionError extends Error {},
}));
vi.mock("@/lib/runtime", () => ({
  getRuntime: async () => ctx.runtime,
  getOperatorLimiter: () => ctx.limiter,
  investigationDeps: (r: Runtime) => depsOf(r),
}));

import { openInvestigation, rerunInvestigation } from "./actions";

const form = (key: string, value: string) => {
  const f = new FormData();
  f.set(key, value);
  return f;
};

async function heldSignal() {
  const outcome = await processSignal(
    "tenant-demo",
    makeRaw({ label: "Possible schedule change for lining PO-77305", references: { purchaseOrder: "PO-77305" }, quantity: undefined, sourceRecordId: "m-9" }),
    { repo: ctx.runtime!.repo, caseIndex: ctx.runtime!.caseIndex },
  );
  return outcome.signalId;
}

beforeEach(async () => {
  env.DATA_SOURCE = "memory";
  env.ENABLE_OPERATOR_ACTIONS = true;
  ctx.runtime = await memoryRuntime("tenant-demo");
  await ctx.runtime.repo.ensureTenant("tenant-other", "Other");
  ctx.limiter = new FixedWindowRateLimiter(10, 60_000);
});

describe("operator actions", () => {
  it("opens an investigation for a held signal under the server tenant, recording the signed-in actor", async () => {
    const id = await heldSignal();
    const result = await openInvestigation(OPERATOR_IDLE, form("signalId", id));
    expect(result).toMatchObject({ status: "done", outcome: "created", caseId: "INV-3001" });
    const detail = await ctx.runtime!.investigations.getCase("tenant-demo", "INV-3001");
    expect(detail?.case.origin).toBe("operator");
    const events = await ctx.runtime!.repo.listEvents("tenant-demo", { limit: 50 });
    expect(events.filter((e) => e.caseId === "INV-3001").every((e) => e.metadata.actor === "Demo manager")).toBe(true);
  });

  it("re-runs a case and appends a run", async () => {
    await openInvestigation(OPERATOR_IDLE, form("signalId", await heldSignal()));
    const result = await rerunInvestigation(OPERATOR_IDLE, form("caseId", "INV-3001"));
    expect(result).toMatchObject({ status: "done", outcome: "updated" });
    expect((await ctx.runtime!.investigations.getCase("tenant-demo", "INV-3001"))?.runs).toHaveLength(2);
  });

  it("refuses when disabled or on fixtures, even if the form is posted directly", async () => {
    const id = await heldSignal();
    env.ENABLE_OPERATOR_ACTIONS = false;
    expect((await openInvestigation(OPERATOR_IDLE, form("signalId", id))).status).toBe("error");
    env.ENABLE_OPERATOR_ACTIONS = true;
    env.DATA_SOURCE = "fixtures";
    expect((await rerunInvestigation(OPERATOR_IDLE, form("caseId", "INV-3001"))).status).toBe("error");
    expect(await ctx.runtime!.investigations.listCases("tenant-demo", { limit: 5 })).toEqual([]);
  });

  it("validates identifiers and never reaches another tenant", async () => {
    expect(await openInvestigation(OPERATOR_IDLE, form("signalId", "x' or 1=1"))).toEqual({ status: "error", message: "Invalid identifier." });
    const other = await processSignal("tenant-other", makeRaw({ sourceRecordId: "o-1" }), { repo: ctx.runtime!.repo, caseIndex: { openCases: () => [] } });
    expect(await openInvestigation(OPERATOR_IDLE, form("signalId", other.signalId))).toEqual({ status: "error", message: "Not found for this tenant." });
    expect(await rerunInvestigation(OPERATOR_IDLE, form("caseId", "INV-9999"))).toEqual({ status: "error", message: "Not found for this tenant." });
  });

  it("applies the rate limit", async () => {
    ctx.limiter = new FixedWindowRateLimiter(1, 60_000);
    await rerunInvestigation(OPERATOR_IDLE, form("caseId", "INV-9999"));
    expect(await rerunInvestigation(OPERATOR_IDLE, form("caseId", "INV-9999"))).toMatchObject({ status: "error", message: expect.stringContaining("Too many") });
  });
});
