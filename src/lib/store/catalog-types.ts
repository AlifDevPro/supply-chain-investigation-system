import type { BusinessDataset } from "@/lib/investigation/seed-records";

/** Rows read per business-record table for browsing views. More rows set `truncated`. */
export const CATALOG_ROW_LIMIT = 500;

/** A tenant's synthetic business records for read-only browsing (graph, integrations). */
export interface CatalogSnapshot extends BusinessDataset {
  /** Newest `updated_at` across the rows read, or null when there are none. */
  updatedAt: string | null;
  /** True when any table had more than CATALOG_ROW_LIMIT rows; only the first rows are included. */
  truncated: boolean;
}

/**
 * Read-only, tenant-scoped listing of business records. Unlike `BusinessRecordReader` (narrow lookups for an
 * investigation run) this returns whole, bounded tables for browsing. No write methods.
 */
export interface BusinessRecordCatalog {
  snapshot(tenantId: string): Promise<CatalogSnapshot>;
}

export interface TableSecurity {
  table: string;
  rowLevelSecurity: boolean;
  /**
   * `append_only`: a trigger rejects update and delete. `no_delete`: a trigger rejects delete only (current-state
   * rows such as cases). `none`: no such trigger was found.
   */
  mutationGuard: "append_only" | "no_delete" | "none";
}

/** Facts read from the database itself, so the UI does not restate them from documentation. */
export interface StoreInspection {
  migrations: Array<{ name: string; appliedAt: string }>;
  tables: TableSecurity[];
}

export interface StoreInspector {
  inspect(): Promise<StoreInspection>;
}

/** Tables whose security posture the Audit & Security page reports. */
export const INSPECTED_TABLES = [
  "tenants", "signals", "signal_events", "suppliers", "materials", "locations", "purchase_orders",
  "purchase_order_lines", "production_orders", "production_requirements", "inventory_balances",
  "inventory_reservations", "shipments", "cases", "case_signals", "investigation_runs", "evidence_items",
  "claims", "unknowns", "conflicts", "impact_calculations", "ai_extractions",
  "users", "review_decisions", "proposed_actions", "action_approvals", "action_executions", "outcome_observations",
] as const;

export const emptyCatalog = (): CatalogSnapshot => ({
  suppliers: [], materials: [], locations: [], purchaseOrders: [], poLines: [], productionOrders: [],
  requirements: [], balances: [], reservations: [], shipments: [], updatedAt: null, truncated: false,
});
