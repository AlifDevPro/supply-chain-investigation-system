import {
  MAX_ROWS_PER_CALL,
  type InventoryBalanceRecord,
  type MaterialRecord,
  type PurchaseOrderRecord,
  type RequirementRecord,
  type ReservationRecord,
  type ShipmentRecord,
} from "./records";

/**
 * Read-only, tenant-scoped retrieval of business records. There are deliberately no write methods and no
 * free-form query: each method answers one narrow question. Implementations must filter by `tenantId` in the
 * query itself and return at most MAX_ROWS_PER_CALL + 1 rows (the extra row only signals truncation).
 */
export interface BusinessRecordReader {
  purchaseOrder(tenantId: string, purchaseOrderId: string): Promise<PurchaseOrderRecord | null>;
  material(tenantId: string, materialId: string): Promise<MaterialRecord | null>;
  inventory(tenantId: string, materialId: string): Promise<InventoryBalanceRecord[]>;
  reservations(tenantId: string, materialId: string, locationId: string): Promise<ReservationRecord[]>;
  /** Open (not completed or cancelled) requirements for a material with required_by in [from, to]. */
  requirements(tenantId: string, materialId: string, window: { from: string; to: string }): Promise<RequirementRecord[]>;
  shipmentsForPurchaseOrder(tenantId: string, purchaseOrderId: string): Promise<ShipmentRecord[]>;
  shipment(tenantId: string, shipmentId: string): Promise<ShipmentRecord | null>;
  /** Inventory balances recorded for a lot (quality holds are visible through `qualityStatus`). */
  lotBalances(tenantId: string, lot: string): Promise<InventoryBalanceRecord[]>;
}

/** Retrieval calls per investigation run. Exceeding it stops retrieval and is reported as partial evidence. */
export const RETRIEVAL_CALL_BUDGET = 12;

export class RetrievalBudgetExceededError extends Error {}

export interface RetrievalCall {
  method: keyof BusinessRecordReader;
  rows: number;
  truncated: boolean;
}

export interface RetrievalAccounting {
  calls: RetrievalCall[];
  rows: number;
  truncated: boolean;
  budgetExhausted: boolean;
}

/**
 * Wraps a reader for one run: pins the tenant, enforces the call budget and the per-call row cap, and keeps
 * counts (never content) for the run record and events.
 */
export class BoundedReader {
  readonly calls: RetrievalCall[] = [];
  budgetExhausted = false;

  constructor(
    private readonly inner: BusinessRecordReader,
    private readonly tenantId: string,
    private readonly budget: number = RETRIEVAL_CALL_BUDGET,
  ) {}

  private spend(method: keyof BusinessRecordReader): void {
    if (this.calls.length >= this.budget) {
      this.budgetExhausted = true;
      throw new RetrievalBudgetExceededError(`Retrieval budget of ${this.budget} calls exhausted at ${method}.`);
    }
  }

  private async one<T>(method: keyof BusinessRecordReader, fn: () => Promise<T | null>): Promise<T | null> {
    this.spend(method);
    const row = await fn();
    this.calls.push({ method, rows: row ? 1 : 0, truncated: false });
    return row;
  }

  private async many<T>(method: keyof BusinessRecordReader, fn: () => Promise<T[]>): Promise<T[]> {
    this.spend(method);
    const rows = await fn();
    const truncated = rows.length > MAX_ROWS_PER_CALL;
    const kept = rows.slice(0, MAX_ROWS_PER_CALL);
    this.calls.push({ method, rows: kept.length, truncated });
    return kept;
  }

  purchaseOrder(id: string) {
    return this.one("purchaseOrder", () => this.inner.purchaseOrder(this.tenantId, id));
  }
  material(id: string) {
    return this.one("material", () => this.inner.material(this.tenantId, id));
  }
  inventory(materialId: string) {
    return this.many("inventory", () => this.inner.inventory(this.tenantId, materialId));
  }
  reservations(materialId: string, locationId: string) {
    return this.many("reservations", () => this.inner.reservations(this.tenantId, materialId, locationId));
  }
  requirements(materialId: string, window: { from: string; to: string }) {
    return this.many("requirements", () => this.inner.requirements(this.tenantId, materialId, window));
  }
  shipmentsForPurchaseOrder(id: string) {
    return this.many("shipmentsForPurchaseOrder", () => this.inner.shipmentsForPurchaseOrder(this.tenantId, id));
  }
  shipment(id: string) {
    return this.one("shipment", () => this.inner.shipment(this.tenantId, id));
  }
  lotBalances(lot: string) {
    return this.many("lotBalances", () => this.inner.lotBalances(this.tenantId, lot));
  }

  accounting(): RetrievalAccounting {
    return {
      calls: [...this.calls],
      rows: this.calls.reduce((n, c) => n + c.rows, 0),
      truncated: this.calls.some((c) => c.truncated),
      budgetExhausted: this.budgetExhausted,
    };
  }
}
