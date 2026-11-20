import { z } from "zod";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import { MAX_ROWS_PER_CALL } from "@/lib/investigation/records";

export const MCP_TOOL_NAMES = [
  "get_purchase_order",
  "get_inventory_balance",
  "get_inventory_reservations",
  "get_production_requirements",
  "get_shipment",
  "get_shipments_for_po",
  "search_quality_by_lot",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

const id = z.string().trim().min(1).max(64);

export const toolInputSchemas = {
  get_purchase_order: z.object({ purchaseOrderId: id }),
  get_inventory_balance: z.object({ materialId: id }),
  get_inventory_reservations: z.object({ materialId: id, locationId: id }),
  get_production_requirements: z.object({
    materialId: id,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  get_shipment: z.object({ shipmentId: id }),
  get_shipments_for_po: z.object({ purchaseOrderId: id }),
  search_quality_by_lot: z.object({ lot: id }),
} as const;

export type ToolInputSchemas = typeof toolInputSchemas;

export const TOOL_DESCRIPTIONS: Record<McpToolName, string> = {
  get_purchase_order: "Read one purchase order and its lines for the server tenant.",
  get_inventory_balance: "List inventory balances for a material (capped).",
  get_inventory_reservations: "List reservations for a material at a location (capped).",
  get_production_requirements: "List open production requirements for a material in a date window (capped).",
  get_shipment: "Read one shipment by id.",
  get_shipments_for_po: "List shipments linked to a purchase order (capped).",
  search_quality_by_lot: "List inventory balances for a lot, including quality status (capped).",
};

function cap<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length <= MAX_ROWS_PER_CALL) return { rows, truncated: false };
  return { rows: rows.slice(0, MAX_ROWS_PER_CALL), truncated: true };
}

/** Executes one read-only tool. Tenant is always the server tenant passed in, never from args. */
export async function runMcpTool(
  name: McpToolName,
  rawArgs: unknown,
  reader: BusinessRecordReader,
  tenantId: string,
): Promise<{ content: unknown; truncated: boolean; rowCount: number }> {
  switch (name) {
    case "get_purchase_order": {
      const args = toolInputSchemas.get_purchase_order.parse(rawArgs);
      const row = await reader.purchaseOrder(tenantId, args.purchaseOrderId);
      return { content: row, truncated: false, rowCount: row ? 1 : 0 };
    }
    case "get_inventory_balance": {
      const args = toolInputSchemas.get_inventory_balance.parse(rawArgs);
      const { rows, truncated } = cap(await reader.inventory(tenantId, args.materialId));
      return { content: rows, truncated, rowCount: rows.length };
    }
    case "get_inventory_reservations": {
      const args = toolInputSchemas.get_inventory_reservations.parse(rawArgs);
      const { rows, truncated } = cap(await reader.reservations(tenantId, args.materialId, args.locationId));
      return { content: rows, truncated, rowCount: rows.length };
    }
    case "get_production_requirements": {
      const args = toolInputSchemas.get_production_requirements.parse(rawArgs);
      const { rows, truncated } = cap(
        await reader.requirements(tenantId, args.materialId, { from: args.from, to: args.to }),
      );
      return { content: rows, truncated, rowCount: rows.length };
    }
    case "get_shipment": {
      const args = toolInputSchemas.get_shipment.parse(rawArgs);
      const row = await reader.shipment(tenantId, args.shipmentId);
      return { content: row, truncated: false, rowCount: row ? 1 : 0 };
    }
    case "get_shipments_for_po": {
      const args = toolInputSchemas.get_shipments_for_po.parse(rawArgs);
      const { rows, truncated } = cap(await reader.shipmentsForPurchaseOrder(tenantId, args.purchaseOrderId));
      return { content: rows, truncated, rowCount: rows.length };
    }
    case "search_quality_by_lot": {
      const args = toolInputSchemas.search_quality_by_lot.parse(rawArgs);
      const { rows, truncated } = cap(await reader.lotBalances(tenantId, args.lot));
      return { content: rows, truncated, rowCount: rows.length };
    }
  }
}

export function isMcpToolName(value: string): value is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(value);
}
