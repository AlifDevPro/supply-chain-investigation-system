import { describe, expect, it } from "vitest";
import { SNAPSHOT_AT } from "@/fixtures/dataset";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import type { CatalogSnapshot } from "@/lib/store/catalog-types";
import { catalogGraph, signalMentionEdges } from "./graph";

function catalog(): CatalogSnapshot {
  return { ...syntheticBusinessDataset(new Date(SNAPSHOT_AT)), updatedAt: SNAPSHOT_AT, truncated: false };
}

describe("signalMentionEdges", () => {
  it("emits inferred edges only when both endpoints exist in the catalog", () => {
    const c = catalog();
    const edges = signalMentionEdges(
      [
        { purchaseOrder: "PO-77410", material: "NV-4410" },
        { purchaseOrder: "PO-MISSING", material: "NV-4410" },
        { lot: "WL-3301" },
      ],
      c,
    );
    expect(edges.every((e) => e.relationship === "inferred")).toBe(true);
    expect(edges.some((e) => e.from === "material:NV-4410" && e.to === "purchase_order:PO-77410")).toBe(true);
    expect(edges.some((e) => e.basis.includes("purchaseOrder") && e.basis.includes("material"))).toBe(true);
    expect(edges.some((e) => e.from.includes("PO-MISSING") || e.to.includes("PO-MISSING"))).toBe(false);
    expect(edges.filter((e) => e.basis.includes("lot")).length).toBe(0);
  });

  it("merges with verified FK edges without inventing orphan nodes", () => {
    const c = catalog();
    const inferred = signalMentionEdges([{ purchaseOrder: "PO-77410", material: "NV-4410", shipment: "SHP-30871" }], c);
    const full = catalogGraph(c, inferred);
    const nodeIds = new Set(full.nodes.map((n) => n.id));
    for (const e of full.edges) {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    }
    expect(full.edges.some((e) => e.relationship === "verified")).toBe(true);
    expect(full.edges.some((e) => e.relationship === "inferred")).toBe(true);
  });
});
