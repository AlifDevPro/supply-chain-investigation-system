import { z } from "zod";
import type { SqlQueryable, SqlRow } from "@/lib/db/sql";
import { unitSchema } from "@/lib/domain/common";
import {
  CATALOG_ROW_LIMIT,
  INSPECTED_TABLES,
  type BusinessRecordCatalog,
  type CatalogSnapshot,
  type StoreInspection,
  type StoreInspector,
} from "./catalog-types";

const LIMIT = CATALOG_ROW_LIMIT + 1;
const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const num = (value: unknown): number => Number(value);
const text = z.string().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const supplier = z.object({ id: text, name: text });
const material = z.object({ id: text, description: text, variant: text, baseUnit: unitSchema });
const location = z.object({ id: text, name: text, kind: z.enum(["factory", "warehouse"]) });
const purchaseOrder = z.object({ id: text, supplierId: text, status: z.enum(["open", "partially_received", "received", "cancelled"]) });
const poLine = z.object({
  purchaseOrderId: text, lineNo: z.number().int().positive(), materialId: text, quantity: z.number().nonnegative(),
  unit: unitSchema, promisedDate: date, destinationLocationId: text,
});
const productionOrder = z.object({ id: text, locationId: text, dueDate: date, status: z.enum(["planned", "released", "in_progress", "completed", "cancelled"]) });
const requirement = z.object({ productionOrderId: text, materialId: text, quantity: z.number().nonnegative(), unit: unitSchema, requiredBy: date });
const balance = z.object({
  id: text, materialId: text, locationId: text, lot: z.string().nullable(), onHand: z.number().nonnegative(), unit: unitSchema,
  qualityStatus: z.enum(["released", "hold", "unknown"]), countedAt: z.string(),
});
const reservation = z.object({ id: text, materialId: text, locationId: text, productionOrderId: text, quantity: z.number().nonnegative(), unit: unitSchema });
const shipment = z.object({
  id: text, purchaseOrderId: text, status: z.enum(["booked", "in_transit", "delayed", "delivered", "cancelled"]),
  eta: date.nullable(), quantity: z.number().nonnegative().nullable(), unit: unitSchema.nullable(),
});

/**
 * Bounded, tenant-scoped listing of the synthetic business records. One fixed statement per table; the only
 * interpolation is the row-limit constant. Rows are validated, so a malformed record is an error.
 */
export class PostgresBusinessRecordCatalog implements BusinessRecordCatalog {
  constructor(private readonly q: SqlQueryable) {}

  async snapshot(tenantId: string): Promise<CatalogSnapshot> {
    const p = [tenantId];
    const [s, m, l, po, lines, prd, req, bal, rsv, shp] = await Promise.all([
      this.q.query(`select id, name, updated_at from suppliers where tenant_id = $1 order by id limit ${LIMIT}`, p),
      this.q.query(`select id, description, variant, base_unit, updated_at from materials where tenant_id = $1 order by id limit ${LIMIT}`, p),
      this.q.query(`select id, name, kind, updated_at from locations where tenant_id = $1 order by id limit ${LIMIT}`, p),
      this.q.query(`select id, supplier_id, status, updated_at from purchase_orders where tenant_id = $1 order by id limit ${LIMIT}`, p),
      this.q.query(
        `select purchase_order_id, line_no, material_id, quantity, unit, to_char(promised_date, 'YYYY-MM-DD') as promised_date,
                destination_location_id, updated_at
           from purchase_order_lines where tenant_id = $1 order by purchase_order_id, line_no limit ${LIMIT}`,
        p,
      ),
      this.q.query(
        `select id, location_id, to_char(due_date, 'YYYY-MM-DD') as due_date, status, updated_at
           from production_orders where tenant_id = $1 order by id limit ${LIMIT}`,
        p,
      ),
      this.q.query(
        `select production_order_id, material_id, quantity, unit, to_char(required_by, 'YYYY-MM-DD') as required_by, updated_at
           from production_requirements where tenant_id = $1 order by production_order_id, material_id limit ${LIMIT}`,
        p,
      ),
      this.q.query(
        `select id, material_id, location_id, lot, on_hand, unit, quality_status, counted_at, updated_at
           from inventory_balances where tenant_id = $1 order by id limit ${LIMIT}`,
        p,
      ),
      this.q.query(
        `select id, material_id, location_id, production_order_id, quantity, unit, updated_at
           from inventory_reservations where tenant_id = $1 order by id limit ${LIMIT}`,
        p,
      ),
      this.q.query(
        `select id, purchase_order_id, status, to_char(eta, 'YYYY-MM-DD') as eta, quantity, unit, updated_at
           from shipments where tenant_id = $1 order by id limit ${LIMIT}`,
        p,
      ),
    ]);
    const all: SqlRow[][] = [s, m, l, po, lines, prd, req, bal, rsv, shp];
    const keep = (rows: SqlRow[]) => rows.slice(0, CATALOG_ROW_LIMIT);
    const stamps = all.flat().map((r) => iso(r.updated_at)).sort();
    return {
      suppliers: keep(s).map((r) => supplier.parse({ id: r.id, name: r.name })),
      materials: keep(m).map((r) => material.parse({ id: r.id, description: r.description, variant: r.variant, baseUnit: r.base_unit })),
      locations: keep(l).map((r) => location.parse({ id: r.id, name: r.name, kind: r.kind })),
      purchaseOrders: keep(po).map((r) => purchaseOrder.parse({ id: r.id, supplierId: r.supplier_id, status: r.status })),
      poLines: keep(lines).map((r) =>
        poLine.parse({
          purchaseOrderId: r.purchase_order_id, lineNo: num(r.line_no), materialId: r.material_id, quantity: num(r.quantity),
          unit: r.unit, promisedDate: r.promised_date, destinationLocationId: r.destination_location_id,
        }),
      ),
      productionOrders: keep(prd).map((r) => productionOrder.parse({ id: r.id, locationId: r.location_id, dueDate: r.due_date, status: r.status })),
      requirements: keep(req).map((r) =>
        requirement.parse({ productionOrderId: r.production_order_id, materialId: r.material_id, quantity: num(r.quantity), unit: r.unit, requiredBy: r.required_by }),
      ),
      balances: keep(bal).map((r) =>
        balance.parse({
          id: r.id, materialId: r.material_id, locationId: r.location_id, lot: r.lot ?? null, onHand: num(r.on_hand), unit: r.unit,
          qualityStatus: r.quality_status, countedAt: iso(r.counted_at),
        }),
      ),
      reservations: keep(rsv).map((r) =>
        reservation.parse({ id: r.id, materialId: r.material_id, locationId: r.location_id, productionOrderId: r.production_order_id, quantity: num(r.quantity), unit: r.unit }),
      ),
      shipments: keep(shp).map((r) =>
        shipment.parse({
          id: r.id, purchaseOrderId: r.purchase_order_id, status: r.status, eta: r.eta ?? null,
          quantity: r.quantity === null ? null : num(r.quantity), unit: r.unit ?? null,
        }),
      ),
      updatedAt: stamps.at(-1) ?? null,
      truncated: all.some((rows) => rows.length > CATALOG_ROW_LIMIT),
    };
  }
}

/** Reads applied migrations and per-table RLS / append-only triggers from the catalog of the current schema. */
export class PostgresStoreInspector implements StoreInspector {
  constructor(private readonly q: SqlQueryable) {}

  async inspect(): Promise<StoreInspection> {
    const [migrations, tables] = await Promise.all([
      this.q.query("select name, applied_at from app_migrations order by name limit 200"),
      this.q.query(
        `select c.relname as table_name, c.relrowsecurity as rls,
                exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                         where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like '%\\_no\\_update\\_delete'
                           and f.proname in ('reject_history_mutation', 'reject_event_mutation')) as append_only,
                exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                         where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like '%\\_no\\_delete'
                           and f.proname = 'reject_history_mutation') as no_delete
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relkind = 'r'
            and c.relname in (select jsonb_array_elements_text($1::text::jsonb))
          order by c.relname`,
        [JSON.stringify(INSPECTED_TABLES)],
      ),
    ]);
    return {
      migrations: migrations.map((r) => ({ name: String(r.name), appliedAt: iso(r.applied_at) })),
      tables: tables.map((r) => ({
        table: String(r.table_name),
        rowLevelSecurity: r.rls === true,
        mutationGuard: r.append_only === true ? ("append_only" as const) : r.no_delete === true ? ("no_delete" as const) : ("none" as const),
      })),
    };
  }
}
