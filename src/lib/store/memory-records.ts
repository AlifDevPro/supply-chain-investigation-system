import type { BusinessRecordReader } from "@/lib/investigation/reader";
import {
  MAX_ROWS_PER_CALL,
  type InventoryBalanceRecord,
  type RecordMeta,
  type RequirementRecord,
  type ShipmentRecord,
} from "@/lib/investigation/records";
import type { BusinessDataset } from "@/lib/investigation/seed-records";
import { CATALOG_ROW_LIMIT, emptyCatalog, type BusinessRecordCatalog, type CatalogSnapshot } from "./catalog-types";

interface TenantData {
  dataset: BusinessDataset;
  updatedAt: string;
}

const LIMIT = MAX_ROWS_PER_CALL + 1;

/**
 * In-memory business-record reader over a synthetic dataset, per tenant. Used by unit tests and the
 * `DATA_SOURCE=memory` development mode. Same semantics as the Postgres reader.
 */
export class InMemoryBusinessRecordReader implements BusinessRecordReader, BusinessRecordCatalog {
  private readonly tenants = new Map<string, TenantData>();

  load(tenantId: string, dataset: BusinessDataset, updatedAt: string): void {
    this.tenants.set(tenantId, { dataset: structuredClone(dataset), updatedAt });
  }

  hasData(tenantId: string): boolean {
    return this.tenants.has(tenantId);
  }

  private data(tenantId: string) {
    return this.tenants.get(tenantId) ?? null;
  }

  private meta(t: TenantData, sourceTable: string, recordId: string): RecordMeta {
    return { sourceTable, recordId, recordVersion: 1, updatedAt: t.updatedAt };
  }

  private balance(t: TenantData, b: BusinessDataset["balances"][number]): InventoryBalanceRecord {
    return {
      meta: this.meta(t, "inventory_balances", b.id),
      id: b.id,
      materialId: b.materialId,
      locationId: b.locationId,
      locationName: t.dataset.locations.find((l) => l.id === b.locationId)?.name ?? b.locationId,
      lot: b.lot,
      onHand: b.onHand,
      unit: b.unit,
      qualityStatus: b.qualityStatus,
      countedAt: b.countedAt,
    };
  }

  private shipmentRecord(t: TenantData, s: BusinessDataset["shipments"][number]): ShipmentRecord {
    return { meta: this.meta(t, "shipments", s.id), ...structuredClone(s) };
  }

  async purchaseOrder(tenantId: string, id: string) {
    const t = this.data(tenantId);
    const po = t?.dataset.purchaseOrders.find((p) => p.id === id);
    if (!t || !po) return null;
    const supplier = t.dataset.suppliers.find((s) => s.id === po.supplierId);
    return {
      meta: this.meta(t, "purchase_orders", po.id),
      id: po.id,
      supplierId: po.supplierId,
      supplierName: supplier?.name ?? po.supplierId,
      status: po.status,
      lines: t.dataset.poLines
        .filter((l) => l.purchaseOrderId === id)
        .sort((a, b) => a.lineNo - b.lineNo)
        .slice(0, LIMIT)
        .map((l) => ({ meta: this.meta(t, "purchase_order_lines", `${l.purchaseOrderId}/${l.lineNo}`), ...structuredClone(l) })),
    };
  }

  async material(tenantId: string, id: string) {
    const t = this.data(tenantId);
    const m = t?.dataset.materials.find((x) => x.id === id);
    return t && m ? { meta: this.meta(t, "materials", m.id), ...structuredClone(m) } : null;
  }

  async inventory(tenantId: string, materialId: string) {
    const t = this.data(tenantId);
    if (!t) return [];
    return t.dataset.balances
      .filter((b) => b.materialId === materialId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map((b) => this.balance(t, b));
  }

  async reservations(tenantId: string, materialId: string, locationId: string) {
    const t = this.data(tenantId);
    if (!t) return [];
    return t.dataset.reservations
      .filter((r) => r.materialId === materialId && r.locationId === locationId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map((r) => ({ meta: this.meta(t, "inventory_reservations", r.id), ...structuredClone(r) }));
  }

  async requirements(tenantId: string, materialId: string, window: { from: string; to: string }): Promise<RequirementRecord[]> {
    const t = this.data(tenantId);
    if (!t) return [];
    return t.dataset.requirements
      .filter((r) => r.materialId === materialId && r.requiredBy >= window.from && r.requiredBy <= window.to)
      .flatMap((r) => {
        const order = t.dataset.productionOrders.find((p) => p.id === r.productionOrderId);
        if (!order || order.status === "completed" || order.status === "cancelled") return [];
        return [{
          meta: this.meta(t, "production_requirements", `${r.productionOrderId}/${r.materialId}`),
          ...structuredClone(r),
          locationId: order.locationId,
          orderStatus: order.status,
        }];
      })
      .sort((a, b) => (a.requiredBy < b.requiredBy ? -1 : a.requiredBy > b.requiredBy ? 1 : a.productionOrderId.localeCompare(b.productionOrderId)))
      .slice(0, LIMIT);
  }

  async shipmentsForPurchaseOrder(tenantId: string, purchaseOrderId: string) {
    const t = this.data(tenantId);
    if (!t) return [];
    return t.dataset.shipments
      .filter((s) => s.purchaseOrderId === purchaseOrderId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map((s) => this.shipmentRecord(t, s));
  }

  async shipment(tenantId: string, id: string) {
    const t = this.data(tenantId);
    const s = t?.dataset.shipments.find((x) => x.id === id);
    return t && s ? this.shipmentRecord(t, s) : null;
  }

  async snapshot(tenantId: string): Promise<CatalogSnapshot> {
    const t = this.data(tenantId);
    if (!t) return emptyCatalog();
    const d = structuredClone(t.dataset);
    const tables = Object.values(d) as unknown[][];
    const cut = <T>(rows: T[]) => rows.slice(0, CATALOG_ROW_LIMIT);
    const empty = tables.every((rows) => rows.length === 0);
    return {
      suppliers: cut(d.suppliers), materials: cut(d.materials), locations: cut(d.locations), purchaseOrders: cut(d.purchaseOrders),
      poLines: cut(d.poLines), productionOrders: cut(d.productionOrders), requirements: cut(d.requirements), balances: cut(d.balances),
      reservations: cut(d.reservations), shipments: cut(d.shipments),
      updatedAt: empty ? null : t.updatedAt,
      truncated: tables.some((rows) => rows.length > CATALOG_ROW_LIMIT),
    };
  }

  async lotBalances(tenantId: string, lot: string) {
    const t = this.data(tenantId);
    if (!t) return [];
    return t.dataset.balances
      .filter((b) => b.lot === lot)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, LIMIT)
      .map((b) => this.balance(t, b));
  }
}
