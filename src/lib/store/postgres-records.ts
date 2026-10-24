import type { SqlClient, SqlQueryable, SqlRow } from "@/lib/db/sql";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import {
  inventoryBalanceRecordSchema,
  materialRecordSchema,
  MAX_ROWS_PER_CALL,
  poLineRecordSchema,
  purchaseOrderRecordSchema,
  requirementRecordSchema,
  reservationRecordSchema,
  shipmentRecordSchema,
  type RecordMeta,
} from "@/lib/investigation/records";
import type { BusinessDataset } from "@/lib/investigation/seed-records";

const LIMIT = MAX_ROWS_PER_CALL + 1;
const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function meta(row: SqlRow, sourceTable: string, recordId: string): RecordMeta {
  return { sourceTable, recordId, recordVersion: num(row.record_version), updatedAt: iso(row.updated_at) };
}

/**
 * Read-only, tenant-scoped retrieval of the synthetic business records. Every query names the tenant and is
 * row-limited; rows are validated, so a malformed record surfaces as an error instead of a guessed value.
 * Dates are formatted by the database as YYYY-MM-DD so no driver time-zone conversion applies.
 */
export class PostgresBusinessRecordReader implements BusinessRecordReader {
  constructor(private readonly q: SqlQueryable) {}

  async purchaseOrder(tenantId: string, id: string) {
    const rows = await this.q.query(
      `select po.id, po.supplier_id, s.name as supplier_name, po.status, po.record_version, po.updated_at
         from purchase_orders po
         join suppliers s on s.tenant_id = po.tenant_id and s.id = po.supplier_id
        where po.tenant_id = $1 and po.id = $2`,
      [tenantId, id],
    );
    const po = rows[0];
    if (!po) return null;
    const lines = await this.q.query(
      `select purchase_order_id, line_no, material_id, quantity, unit, to_char(promised_date, 'YYYY-MM-DD') as promised_date,
              destination_location_id, record_version, updated_at
         from purchase_order_lines where tenant_id = $1 and purchase_order_id = $2 order by line_no limit ${LIMIT}`,
      [tenantId, id],
    );
    return purchaseOrderRecordSchema.parse({
      meta: meta(po, "purchase_orders", String(po.id)),
      id: po.id,
      supplierId: po.supplier_id,
      supplierName: po.supplier_name,
      status: po.status,
      lines: lines.map((l) =>
        poLineRecordSchema.parse({
          meta: meta(l, "purchase_order_lines", `${String(l.purchase_order_id)}/${String(l.line_no)}`),
          purchaseOrderId: l.purchase_order_id,
          lineNo: num(l.line_no),
          materialId: l.material_id,
          quantity: num(l.quantity),
          unit: l.unit,
          promisedDate: l.promised_date,
          destinationLocationId: l.destination_location_id,
        }),
      ),
    });
  }

  async material(tenantId: string, id: string) {
    const rows = await this.q.query(
      "select id, description, variant, base_unit, record_version, updated_at from materials where tenant_id = $1 and id = $2",
      [tenantId, id],
    );
    const m = rows[0];
    return m
      ? materialRecordSchema.parse({ meta: meta(m, "materials", String(m.id)), id: m.id, description: m.description, variant: m.variant, baseUnit: m.base_unit })
      : null;
  }

  private async balances(tenantId: string, where: string, value: string) {
    const rows = await this.q.query(
      `select b.id, b.material_id, b.location_id, l.name as location_name, b.lot, b.on_hand, b.unit, b.quality_status,
              b.counted_at, b.record_version, b.updated_at
         from inventory_balances b
         join locations l on l.tenant_id = b.tenant_id and l.id = b.location_id
        where b.tenant_id = $1 and ${where} = $2 order by b.id limit ${LIMIT}`,
      [tenantId, value],
    );
    return rows.map((b) =>
      inventoryBalanceRecordSchema.parse({
        meta: meta(b, "inventory_balances", String(b.id)),
        id: b.id,
        materialId: b.material_id,
        locationId: b.location_id,
        locationName: b.location_name,
        lot: b.lot ?? null,
        onHand: num(b.on_hand),
        unit: b.unit,
        qualityStatus: b.quality_status,
        countedAt: iso(b.counted_at),
      }),
    );
  }

  inventory(tenantId: string, materialId: string) {
    return this.balances(tenantId, "b.material_id", materialId);
  }

  lotBalances(tenantId: string, lot: string) {
    return this.balances(tenantId, "b.lot", lot);
  }

  async reservations(tenantId: string, materialId: string, locationId: string) {
    const rows = await this.q.query(
      `select id, material_id, location_id, production_order_id, quantity, unit, record_version, updated_at
         from inventory_reservations where tenant_id = $1 and material_id = $2 and location_id = $3 order by id limit ${LIMIT}`,
      [tenantId, materialId, locationId],
    );
    return rows.map((r) =>
      reservationRecordSchema.parse({
        meta: meta(r, "inventory_reservations", String(r.id)),
        id: r.id,
        materialId: r.material_id,
        locationId: r.location_id,
        productionOrderId: r.production_order_id,
        quantity: num(r.quantity),
        unit: r.unit,
      }),
    );
  }

  async requirements(tenantId: string, materialId: string, window: { from: string; to: string }) {
    const rows = await this.q.query(
      `select r.production_order_id, r.material_id, r.quantity, r.unit, to_char(r.required_by, 'YYYY-MM-DD') as required_by,
              p.location_id, p.status as order_status, r.record_version, r.updated_at
         from production_requirements r
         join production_orders p on p.tenant_id = r.tenant_id and p.id = r.production_order_id
        where r.tenant_id = $1 and r.material_id = $2 and r.required_by between $3::date and $4::date
          and p.status not in ('completed', 'cancelled')
        order by r.required_by, r.production_order_id limit ${LIMIT}`,
      [tenantId, materialId, window.from, window.to],
    );
    return rows.map((r) =>
      requirementRecordSchema.parse({
        meta: meta(r, "production_requirements", `${String(r.production_order_id)}/${String(r.material_id)}`),
        productionOrderId: r.production_order_id,
        materialId: r.material_id,
        quantity: num(r.quantity),
        unit: r.unit,
        requiredBy: r.required_by,
        locationId: r.location_id,
        orderStatus: r.order_status,
      }),
    );
  }

  private async shipments(tenantId: string, where: string, value: string) {
    const rows = await this.q.query(
      `select id, purchase_order_id, status, to_char(eta, 'YYYY-MM-DD') as eta, quantity, unit, record_version, updated_at
         from shipments where tenant_id = $1 and ${where} = $2 order by id limit ${LIMIT}`,
      [tenantId, value],
    );
    return rows.map((s) =>
      shipmentRecordSchema.parse({
        meta: meta(s, "shipments", String(s.id)),
        id: s.id,
        purchaseOrderId: s.purchase_order_id,
        status: s.status,
        eta: s.eta ?? null,
        quantity: numOrNull(s.quantity),
        unit: s.unit ?? null,
      }),
    );
  }

  shipmentsForPurchaseOrder(tenantId: string, purchaseOrderId: string) {
    return this.shipments(tenantId, "purchase_order_id", purchaseOrderId);
  }

  async shipment(tenantId: string, id: string) {
    return (await this.shipments(tenantId, "id", id))[0] ?? null;
  }
}

interface TableSpec {
  table: string;
  keys: string[];
  columns: Array<[name: string, type: string]>;
  rows: Array<Record<string, unknown>>;
}

function specs(d: BusinessDataset): TableSpec[] {
  return [
    { table: "suppliers", keys: ["id"], columns: [["id", "text"], ["name", "text"]], rows: d.suppliers },
    {
      table: "materials", keys: ["id"],
      columns: [["id", "text"], ["description", "text"], ["variant", "text"], ["base_unit", "text"]],
      rows: d.materials.map((m) => ({ id: m.id, description: m.description, variant: m.variant, base_unit: m.baseUnit })),
    },
    { table: "locations", keys: ["id"], columns: [["id", "text"], ["name", "text"], ["kind", "text"]], rows: d.locations },
    {
      table: "purchase_orders", keys: ["id"], columns: [["id", "text"], ["supplier_id", "text"], ["status", "text"]],
      rows: d.purchaseOrders.map((p) => ({ id: p.id, supplier_id: p.supplierId, status: p.status })),
    },
    {
      table: "purchase_order_lines", keys: ["purchase_order_id", "line_no"],
      columns: [["purchase_order_id", "text"], ["line_no", "integer"], ["material_id", "text"], ["quantity", "numeric"],
        ["unit", "text"], ["promised_date", "date"], ["destination_location_id", "text"]],
      rows: d.poLines.map((l) => ({
        purchase_order_id: l.purchaseOrderId, line_no: l.lineNo, material_id: l.materialId, quantity: l.quantity,
        unit: l.unit, promised_date: l.promisedDate, destination_location_id: l.destinationLocationId,
      })),
    },
    {
      table: "production_orders", keys: ["id"], columns: [["id", "text"], ["location_id", "text"], ["due_date", "date"], ["status", "text"]],
      rows: d.productionOrders.map((p) => ({ id: p.id, location_id: p.locationId, due_date: p.dueDate, status: p.status })),
    },
    {
      table: "production_requirements", keys: ["production_order_id", "material_id"],
      columns: [["production_order_id", "text"], ["material_id", "text"], ["quantity", "numeric"], ["unit", "text"], ["required_by", "date"]],
      rows: d.requirements.map((r) => ({
        production_order_id: r.productionOrderId, material_id: r.materialId, quantity: r.quantity, unit: r.unit, required_by: r.requiredBy,
      })),
    },
    {
      table: "inventory_balances", keys: ["id"],
      columns: [["id", "text"], ["material_id", "text"], ["location_id", "text"], ["lot", "text"], ["on_hand", "numeric"],
        ["unit", "text"], ["quality_status", "text"], ["counted_at", "timestamptz"]],
      rows: d.balances.map((b) => ({
        id: b.id, material_id: b.materialId, location_id: b.locationId, lot: b.lot, on_hand: b.onHand, unit: b.unit,
        quality_status: b.qualityStatus, counted_at: b.countedAt,
      })),
    },
    {
      table: "inventory_reservations", keys: ["id"],
      columns: [["id", "text"], ["material_id", "text"], ["location_id", "text"], ["production_order_id", "text"], ["quantity", "numeric"], ["unit", "text"]],
      rows: d.reservations.map((r) => ({
        id: r.id, material_id: r.materialId, location_id: r.locationId, production_order_id: r.productionOrderId, quantity: r.quantity, unit: r.unit,
      })),
    },
    {
      table: "shipments", keys: ["id"],
      columns: [["id", "text"], ["purchase_order_id", "text"], ["status", "text"], ["eta", "date"], ["quantity", "numeric"], ["unit", "text"]],
      rows: d.shipments.map((s) => ({ id: s.id, purchase_order_id: s.purchaseOrderId, status: s.status, eta: s.eta, quantity: s.quantity, unit: s.unit })),
    },
  ];
}

export interface SeedRecordsResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * Writes the synthetic dataset for one tenant (seed scripts only; the application never writes business
 * records). Existing rows are left alone unless `refresh` is set, in which case changed rows are updated and
 * their `record_version` is incremented so evidence from earlier runs still points at the older version.
 */
export async function seedBusinessDataset(
  client: SqlClient,
  tenantId: string,
  dataset: BusinessDataset,
  options: { refresh?: boolean } = {},
): Promise<SeedRecordsResult> {
  return client.transaction(async (q) => {
    const result: SeedRecordsResult = { inserted: 0, updated: 0, unchanged: 0 };
    for (const spec of specs(dataset)) {
      if (spec.rows.length === 0) continue;
      const names = spec.columns.map(([n]) => n);
      const values = names.filter((n) => !spec.keys.includes(n));
      const conflict = options.refresh
        ? `do update set ${values.map((n) => `${n} = excluded.${n}`).join(", ")},
             record_version = ${spec.table}.record_version + 1, updated_at = now()
           where (${values.map((n) => `${spec.table}.${n}`).join(", ")}) is distinct from (${values.map((n) => `excluded.${n}`).join(", ")})`
        : "do nothing";
      const rows = await q.query(
        `insert into ${spec.table} (tenant_id, ${names.join(", ")}, data_mode)
         select $1, ${names.map((n) => `x.${n}`).join(", ")}, 'synthetic'
           from jsonb_to_recordset($2::text::jsonb) as x(${spec.columns.map(([n, t]) => `${n} ${t}`).join(", ")})
         on conflict (tenant_id, ${spec.keys.join(", ")}) ${conflict}
         returning (xmax = 0) as inserted`,
        [tenantId, JSON.stringify(spec.rows)],
      );
      const inserted = rows.filter((r) => r.inserted === true).length;
      result.inserted += inserted;
      result.updated += rows.length - inserted;
      result.unchanged += spec.rows.length - rows.length;
    }
    return result;
  });
}
