import { describe, expect, it } from "vitest";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { TENANT_A, TENANT_B } from "./contract";
import type { BusinessRecordCatalog } from "./catalog-types";

export interface CatalogHarness {
  catalog: BusinessRecordCatalog;
  /** Loads the synthetic dataset for a tenant. */
  seed(tenantId: string): Promise<void> | void;
  close?: () => Promise<void>;
}

/** Shared read behaviour for every BusinessRecordCatalog. */
export function describeCatalogContract(name: string, factory: () => Promise<CatalogHarness>) {
  describe(`BusinessRecordCatalog contract: ${name}`, () => {
    it("returns the seeded records for one tenant and nothing for another", async () => {
      const h = await factory();
      await h.seed(TENANT_A);
      const a = await h.catalog.snapshot(TENANT_A);
      expect(a.suppliers.map((s) => s.id)).toContain("SUP-103");
      expect(a.materials.map((m) => m.id)).toContain("NV-4410");
      expect(a.purchaseOrders.map((p) => p.id)).toContain("PO-77410");
      expect(a.shipments.map((s) => s.id)).toContain("SHP-30871");
      expect(a.updatedAt).not.toBeNull();
      expect(a.truncated).toBe(false);
      const b = await h.catalog.snapshot(TENANT_B);
      expect(b.suppliers).toEqual([]);
      expect(b.purchaseOrders).toEqual([]);
      expect(b.updatedAt).toBeNull();
      await h.close?.();
    });

    it("matches the synthetic dataset shape", async () => {
      const h = await factory();
      await h.seed(TENANT_A);
      const snap = await h.catalog.snapshot(TENANT_A);
      const seeded = syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z"));
      expect(snap.suppliers.map((s) => s.id).sort()).toEqual(seeded.suppliers.map((s) => s.id).sort());
      expect(snap.materials.map((m) => m.id).sort()).toEqual(seeded.materials.map((m) => m.id).sort());
      expect(snap.poLines.map((l) => `${l.purchaseOrderId}/${l.lineNo}`).sort()).toEqual(
        seeded.poLines.map((l) => `${l.purchaseOrderId}/${l.lineNo}`).sort(),
      );
      await h.close?.();
    });
  });
}
