import { describe, expect, it } from "vitest";
import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type { ConnectorRunRow, IntegrationRepository, ToolCallRow } from "./integration-types";
import { TENANT_A, TENANT_B } from "./contract";

export interface IntegrationHarness {
  integrations: IntegrationRepository;
  ensureTenant: (id: string) => Promise<void>;
  close?: () => Promise<void>;
}

function tool(tenantId: string, id: string, overrides: Partial<ToolCallRow> = {}): ToolCallRow {
  return {
    tenantId,
    id,
    toolName: "get_purchase_order",
    status: "completed",
    durationMs: 12,
    actorKind: "mcp_key",
    actorId: "mcp",
    errorClass: null,
    metadata: { rows: 1 },
    at: "2026-10-24T09:00:00.000Z",
    dataMode: "synthetic",
    ...overrides,
  };
}

function run(tenantId: string, id: string, overrides: Partial<ConnectorRunRow> = {}): ConnectorRunRow {
  return {
    tenantId,
    id,
    connectorId: "mailbox",
    status: "completed",
    httpStatusClass: "2xx",
    signalsIngested: 1,
    errorClass: null,
    durationMs: 40,
    actorUserId: null,
    metadata: {},
    at: "2026-10-24T09:01:00.000Z",
    dataMode: "synthetic",
    ...overrides,
  };
}

export function describeIntegrationContract(name: string, factory: () => Promise<IntegrationHarness>) {
  describe(`integration contract (${name})`, () => {
    it("isolates tool calls and connector runs by tenant", async () => {
      const h = await factory();
      await h.ensureTenant(TENANT_A);
      await h.ensureTenant(TENANT_B);
      await h.integrations.insertToolCall(tool(TENANT_A, "TOOL-A"));
      await h.integrations.insertToolCall(tool(TENANT_B, "TOOL-B"));
      await h.integrations.insertConnectorRun(run(TENANT_A, "RUN-A"));
      await h.integrations.insertConnectorRun(run(TENANT_B, "RUN-B", { connectorId: "carrier" }));
      expect((await h.integrations.listToolCalls(TENANT_A, { limit: 10 })).map((t) => t.id)).toEqual(["TOOL-A"]);
      expect((await h.integrations.listConnectorRuns(TENANT_A, { limit: 10 })).map((r) => r.id)).toEqual(["RUN-A"]);
      expect((await h.integrations.latestConnectorRun(TENANT_A, "mailbox"))?.id).toBe("RUN-A");
      expect(await h.integrations.latestConnectorRun(TENANT_A, "carrier")).toBeNull();
      await h.close?.();
    });

    it("rejects unknown tenants and duplicate ids", async () => {
      const h = await factory();
      await expect(h.integrations.insertToolCall(tool("tenant-missing", "TOOL-X"))).rejects.toBeInstanceOf(ForeignKeyViolationError);
      await h.ensureTenant(TENANT_A);
      await h.integrations.insertToolCall(tool(TENANT_A, "TOOL-1"));
      await expect(h.integrations.insertToolCall(tool(TENANT_A, "TOOL-1"))).rejects.toBeInstanceOf(UniqueViolationError);
      await h.integrations.insertConnectorRun(run(TENANT_A, "RUN-1"));
      await expect(h.integrations.insertConnectorRun(run(TENANT_A, "RUN-1"))).rejects.toBeInstanceOf(UniqueViolationError);
      await h.close?.();
    });
  });
}
