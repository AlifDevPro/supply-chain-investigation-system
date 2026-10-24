import { beforeEach, describe, expect, it, vi } from "vitest";
import { FixedWindowRateLimiter } from "@/lib/ingestion/rate-limit";
import { makeRaw } from "@/lib/ingestion/test-helpers";
import type { Runtime } from "@/lib/runtime";
import { depsOf, memoryRuntime } from "@/test/memory-runtime";
import { IDLE } from "./submit-state";

const env = { DATA_SOURCE: "memory", ENABLE_SYNTHETIC_SUBMIT: true, DEMO_TENANT_ID: "tenant-demo" };
const ctx: { runtime: Runtime | null; limiter: FixedWindowRateLimiter; fail: boolean } = {
  runtime: null,
  limiter: new FixedWindowRateLimiter(30, 60_000),
  fail: false,
};

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
vi.mock("@/lib/runtime", () => ({
  getRuntime: async () => {
    if (ctx.fail) throw new Error("password=hunter2");
    return ctx.runtime;
  },
  getLimiters: () => ({ limiter: ctx.limiter }),
  investigationDeps: (r: Runtime) => depsOf(r),
}));

import { submitSyntheticSignal } from "./actions";

const form = (payload: string) => {
  const f = new FormData();
  f.set("payload", payload);
  return f;
};

beforeEach(async () => {
  env.DATA_SOURCE = "memory";
  env.ENABLE_SYNTHETIC_SUBMIT = true;
  ctx.runtime = await memoryRuntime("tenant-demo");
  ctx.limiter = new FixedWindowRateLimiter(30, 60_000);
  ctx.fail = false;
});

describe("submitSyntheticSignal (server action)", () => {
  it("refuses to run when submission is disabled, even if the form is posted directly", async () => {
    env.ENABLE_SYNTHETIC_SUBMIT = false;
    const result = await submitSyntheticSignal(IDLE, form(makeRaw()));
    expect(result.status).toBe("error");
    expect(await ctx.runtime!.repo.listSignals("tenant-demo", { limit: 5 })).toEqual([]);
  });

  it("refuses to run against fixtures", async () => {
    env.DATA_SOURCE = "fixtures";
    expect((await submitSyntheticSignal(IDLE, form(makeRaw()))).status).toBe("error");
  });

  it("processes a signal through the real pipeline under the server tenant", async () => {
    const result = await submitSyntheticSignal(IDLE, form(makeRaw({ quantity: { value: 100, unit: "m" } })));
    expect(result).toMatchObject({ status: "done", kind: "accepted", triageOutcome: "relevant", investigation: "created", caseId: "INV-3001" });
    expect(await ctx.runtime!.repo.listSignals("tenant-demo", { limit: 5 })).toHaveLength(1);
    expect(await ctx.runtime!.investigations.listCases("tenant-demo", { limit: 5 })).toHaveLength(1);
  });

  it("reports a rejected payload with paths and codes only", async () => {
    const result = await submitSyntheticSignal(IDLE, form('{"label":"SECRET-123"}'));
    expect(result).toMatchObject({ status: "done", kind: "rejected" });
    expect(JSON.stringify(result)).not.toContain("SECRET-123");
  });

  it("rejects an empty payload and applies the rate limit", async () => {
    expect((await submitSyntheticSignal(IDLE, form("   "))).status).toBe("error");
    ctx.limiter = new FixedWindowRateLimiter(1, 60_000);
    await submitSyntheticSignal(IDLE, form(makeRaw()));
    const limited = await submitSyntheticSignal(IDLE, form(makeRaw()));
    expect(limited).toMatchObject({ status: "error", message: expect.stringContaining("Too many") });
  });

  it("returns a safe error when the store is unavailable", async () => {
    ctx.fail = true;
    const result = await submitSyntheticSignal(IDLE, form(makeRaw()));
    expect(result).toEqual({ status: "error", message: "The signal store is unavailable. Nothing was stored." });
  });
});
