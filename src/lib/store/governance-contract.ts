import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type { GovernanceRepository, StoredProposedAction, StoredUser } from "./governance-types";
import { TENANT_A, TENANT_B } from "./contract";

export interface GovernanceHarness {
  governance: GovernanceRepository;
  ensureTenant: (id: string) => Promise<void>;
  seedCase: (tenantId: string, caseId: string) => Promise<void>;
  close?: () => Promise<void>;
}

function user(tenantId: string, id: string, hash: string): StoredUser {
  return {
    tenantId,
    id,
    email: `${id.toLowerCase()}@demo.local`,
    displayName: id,
    role: "manager",
    passwordHash: hash,
    googleSub: null,
    disabledAt: null,
    createdAt: "2026-10-24T09:00:00.000Z",
    dataMode: "synthetic",
  };
}

function action(tenantId: string, id: string, caseId = "INV-1"): StoredProposedAction {
  return {
    tenantId,
    id,
    caseId,
    title: "Ask supplier to confirm revised ship date",
    parameters: [{ label: "Purchase order", value: "PO-1" }],
    parameterDigest: "a".repeat(64),
    rationale: "Dates conflict.",
    origin: "rule_suggested",
    status: "awaiting_approval",
    version: 1,
    requiredRole: "procurement",
    updatedAt: "2026-10-24T09:00:00.000Z",
    dataMode: "synthetic",
  };
}

export function describeGovernanceContract(name: string, factory: () => Promise<GovernanceHarness>) {
  describe(`governance contract (${name})`, () => {
    it("isolates users by tenant", async () => {
      const h = await factory();
      const hash = await hashPassword("correct-horse-battery");
      await h.ensureTenant(TENANT_A);
      await h.ensureTenant(TENANT_B);
      await h.governance.upsertUser(user(TENANT_A, "USR-A", hash));
      await h.governance.upsertUser(user(TENANT_B, "USR-B", hash));
      expect(await h.governance.getUserById(TENANT_A, "USR-B")).toBeNull();
      expect(await h.governance.getUserByEmail(TENANT_A, "usr-b@demo.local")).toBeNull();
      expect((await h.governance.getUserById(TENANT_A, "USR-A"))?.role).toBe("manager");
      await h.governance.linkGoogleSub(TENANT_A, "USR-A", "google-sub-a");
      expect((await h.governance.getUserByGoogleSub(TENANT_A, "google-sub-a"))?.id).toBe("USR-A");
      expect(await h.governance.getUserByGoogleSub(TENANT_B, "google-sub-a")).toBeNull();
      await h.close?.();
    });

    it("rejects a user on an unknown tenant", async () => {
      const h = await factory();
      const hash = await hashPassword("correct-horse-battery");
      await expect(h.governance.upsertUser(user("tenant-missing", "USR-X", hash))).rejects.toBeInstanceOf(ForeignKeyViolationError);
      await h.close?.();
    });

    it("upserts versioned actions and keeps approvals and executions tenant-scoped", async () => {
      const h = await factory();
      const hash = await hashPassword("correct-horse-battery");
      await h.ensureTenant(TENANT_A);
      await h.ensureTenant(TENANT_B);
      await h.seedCase(TENANT_A, "INV-1");
      await h.governance.upsertUser(user(TENANT_A, "USR-A", hash));
      await h.governance.upsertAction(action(TENANT_A, "INV-1-ASK-DATE"));
      await h.governance.upsertAction({ ...action(TENANT_A, "INV-1-ASK-DATE"), version: 2, parameterDigest: "b".repeat(64) });
      expect((await h.governance.getAction(TENANT_A, "INV-1-ASK-DATE"))?.version).toBe(2);
      expect(await h.governance.getAction(TENANT_B, "INV-1-ASK-DATE")).toBeNull();
      await h.governance.insertApproval({
        tenantId: TENANT_A, id: "APR-1", actionId: "INV-1-ASK-DATE", approvedVersion: 2,
        parameterDigest: "b".repeat(64), actorUserId: "USR-A", at: "2026-10-24T09:01:00.000Z", dataMode: "synthetic",
      });
      await h.governance.insertExecution({
        tenantId: TENANT_A, id: "EX-1", actionId: "INV-1-ASK-DATE", actionVersion: 2, adapter: "synthetic.v1",
        status: "completed", sent: false, reason: "no connector", idempotencyKey: `${TENANT_A}:INV-1-ASK-DATE:2`,
        actorUserId: "USR-A", at: "2026-10-24T09:02:00.000Z", dataMode: "synthetic",
      });
      await expect(
        h.governance.insertExecution({
          tenantId: TENANT_A, id: "EX-2", actionId: "INV-1-ASK-DATE", actionVersion: 2, adapter: "synthetic.v1",
          status: "completed", sent: false, reason: "no connector", idempotencyKey: `${TENANT_A}:INV-1-ASK-DATE:2`,
          actorUserId: "USR-A", at: "2026-10-24T09:03:00.000Z", dataMode: "synthetic",
        }),
      ).rejects.toBeInstanceOf(UniqueViolationError);
      expect(await h.governance.listApprovals(TENANT_B, "INV-1-ASK-DATE")).toEqual([]);
      expect((await h.governance.listExecutions(TENANT_A, "INV-1-ASK-DATE")).map((e) => e.sent)).toEqual([false]);
      await h.close?.();
    });
  });
}
