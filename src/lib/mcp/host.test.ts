import { describe, expect, it } from "vitest";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { InMemoryIntegrationRepository } from "@/lib/store/memory-integrations";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { InMemorySignalRepository, MemoryDb } from "@/lib/store/memory";
import { invokeTool, McpToolError } from "./host";

describe("MCP tool host", () => {
  async function deps() {
    const db = new MemoryDb();
    const signals = new InMemorySignalRepository(db);
    const integrations = new InMemoryIntegrationRepository(db);
    const reader = new InMemoryBusinessRecordReader();
    const tenantId = "tenant-demo";
    await signals.ensureTenant(tenantId, "demo");
    reader.load(tenantId, syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z")), "2026-10-24T06:00:00.000Z");
    return {
      tenantId,
      reader,
      integrations,
      signals,
      timeoutMs: 5_000,
    };
  }

  it("reads a purchase order and writes audit + events", async () => {
    const d = await deps();
    const out = await invokeTool(d, "get_purchase_order", { purchaseOrderId: "PO-77410" }, { kind: "mcp_key", id: "mcp" });
    expect(out.rowCount).toBe(1);
    expect(out.result).toMatchObject({ id: "PO-77410" });
    const calls = await d.integrations.listToolCalls(d.tenantId, { limit: 5 });
    expect(calls[0]?.status).toBe("completed");
    const events = await d.signals.listEvents(d.tenantId, { limit: 10 });
    expect(events.some((e) => e.type === "tool.called")).toBe(true);
    expect(events.some((e) => e.type === "tool.completed")).toBe(true);
  });

  it("rejects unknown tools and bad args", async () => {
    const d = await deps();
    await expect(invokeTool(d, "drop_table", {}, { kind: "stdio", id: "stdio" })).rejects.toBeInstanceOf(McpToolError);
    await expect(
      invokeTool(d, "get_purchase_order", { purchaseOrderId: "" }, { kind: "stdio", id: "stdio" }),
    ).rejects.toBeInstanceOf(McpToolError);
    const failed = await d.integrations.listToolCalls(d.tenantId, { limit: 5 });
    expect(failed.some((c) => c.status === "failed" && c.toolName === "get_purchase_order")).toBe(true);
  });

  it("never takes tenant from args", async () => {
    const d = await deps();
    const out = await invokeTool(
      d,
      "get_purchase_order",
      { purchaseOrderId: "PO-77410", tenantId: "other-tenant" },
      { kind: "mcp_key", id: "mcp" },
    );
    expect(out.result).toMatchObject({ id: "PO-77410" });
  });
});
