import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCase } from "@/lib/store/investigation-contract";
import type { Runtime } from "@/lib/runtime";
import { memoryRuntime } from "@/test/memory-runtime";
import { ACTION_IDLE } from "./action-state";
import { syncProposedActions } from "@/lib/actions/propose";
import type { Conflict } from "@/lib/domain";
import type { SessionUser } from "@/lib/auth/session";

const ctx: { runtime: Runtime | null; session: SessionUser | null } = { runtime: null, session: null };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/runtime", () => ({
  getRuntime: async () => ctx.runtime,
}));
vi.mock("@/lib/auth/session", async () => {
  class SessionError extends Error {
    constructor(message = "Sign in required.") {
      super(message);
      this.name = "SessionError";
    }
  }
  return {
    SessionError,
    requireSession: async () => {
      if (!ctx.session) throw new SessionError();
      return ctx.session;
    },
  };
});

import { approveProposedAction, rejectProposedAction } from "./action-actions";

const reviewer: SessionUser = {
  userId: "USR-REVIEWER", tenantId: "tenant-demo", role: "reviewer", displayName: "Demo reviewer", email: "reviewer@demo.local",
};
const procurement: SessionUser = {
  userId: "USR-PROCUREMENT", tenantId: "tenant-demo", role: "procurement", displayName: "Demo procurement", email: "procurement@demo.local",
};

const conflict: Conflict = {
  id: "c1", caseId: "INV-1", description: "A delay is reported but the promised date differs.",
  sides: [], dataMode: "synthetic",
};

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("proposed-action server actions", () => {
  beforeEach(async () => {
    ctx.runtime = await memoryRuntime("tenant-demo");
    await ctx.runtime.investigations.transaction((tx) => tx.insertCase(makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" })));
    await syncProposedActions({
      tenantId: "tenant-demo",
      stored: makeCase("INV-1", "tenant-demo", { state: "awaiting_approval" }),
      conflicts: [conflict],
      unknowns: [],
      governance: ctx.runtime.governance,
      updateCase: (c) => ctx.runtime!.investigations.transaction((tx) => tx.updateCase(c)),
      now: new Date("2026-10-24T09:00:00.000Z"),
    });
    ctx.session = procurement;
  });

  it("rejects an unauthenticated POST", async () => {
    ctx.session = null;
    const action = (await ctx.runtime!.governance.listActionsForCase("tenant-demo", "INV-1"))[0]!;
    const result = await approveProposedAction(ACTION_IDLE, form({
      actionId: action.id, version: String(action.version), digest: action.parameterDigest, caseId: "INV-1",
    }));
    expect(result).toEqual({ status: "error", message: "Sign in required." });
    expect((await ctx.runtime!.governance.getAction("tenant-demo", action.id))?.status).not.toBe("approved");
  });

  it("rejects a reviewer on a procurement action without changing state", async () => {
    ctx.session = reviewer;
    const action = (await ctx.runtime!.governance.listActionsForCase("tenant-demo", "INV-1"))[0]!;
    const before = (await ctx.runtime!.investigations.getCase("tenant-demo", "INV-1"))!.case.state;
    const result = await approveProposedAction(ACTION_IDLE, form({
      actionId: action.id, version: String(action.version), digest: action.parameterDigest, caseId: "INV-1",
    }));
    expect(result.status).toBe("error");
    expect((await ctx.runtime!.investigations.getCase("tenant-demo", "INV-1"))!.case.state).toBe(before);
  });

  it("rejects a stale version", async () => {
    const action = (await ctx.runtime!.governance.listActionsForCase("tenant-demo", "INV-1"))[0]!;
    const result = await approveProposedAction(ACTION_IDLE, form({
      actionId: action.id, version: String(action.version + 3), digest: action.parameterDigest, caseId: "INV-1",
    }));
    expect(result.status).toBe("error");
    expect((await ctx.runtime!.governance.getAction("tenant-demo", action.id))?.status).toBe("awaiting_approval");
  });

  it("rejects a POST that names another tenant in the session", async () => {
    ctx.session = { ...procurement, tenantId: "tenant-other" };
    const action = (await ctx.runtime!.governance.listActionsForCase("tenant-demo", "INV-1"))[0]!;
    const result = await rejectProposedAction(ACTION_IDLE, form({
      actionId: action.id, version: String(action.version), digest: action.parameterDigest, caseId: "INV-1", rationale: "no",
    }));
    expect(result.status).toBe("error");
  });
});
