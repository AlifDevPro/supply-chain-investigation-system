import { addDays } from "@/lib/impact/dates";
import type { BoundedReader } from "./reader";
import { RetrievalBudgetExceededError } from "./reader";
import type {
  InventoryBalanceRecord,
  MaterialRecord,
  PoLineRecord,
  PurchaseOrderRecord,
  RequirementRecord,
  ReservationRecord,
  ShipmentRecord,
} from "./records";
import type { ReferenceSet } from "./signals";

/** Requirements considered: due from 14 days ago (overdue still matters) to 60 days ahead. */
export const REQUIREMENT_WINDOW = { pastDays: 14, futureDays: 60 } as const;

/** A lookup that was attempted. `found: false` means "not found in the searched scope", nothing more. */
export interface Lookup<T> {
  key: string;
  found: boolean;
  record: T | null;
}

export interface Retrieved {
  references: ReferenceSet;
  purchaseOrder: Lookup<PurchaseOrderRecord> | null;
  /** The purchase-order line the investigation focuses on (matching material, or the only line). */
  line: PoLineRecord | null;
  shipments: ShipmentRecord[];
  /** Shipments were looked up for the purchase order (an empty list then means none recorded). */
  shipmentsSearched: boolean;
  shipment: Lookup<ShipmentRecord> | null;
  lot: Lookup<InventoryBalanceRecord[]> | null;
  material: Lookup<MaterialRecord> | null;
  materialId: string | null;
  locationId: string | null;
  inventory: InventoryBalanceRecord[] | null;
  reservations: ReservationRecord[] | null;
  requirements: RequirementRecord[] | null;
  requirementWindow: { from: string; to: string } | null;
  /** Lookups that could not run because the call budget ran out. */
  skipped: string[];
}

/**
 * Narrow, deterministic retrieval plan for one case. Follows references from the signals to the records
 * that can confirm or contradict them. Never searches broadly; every call goes through the bounded reader.
 * Reader errors propagate (the run fails explicitly); an exhausted budget yields partial evidence.
 */
export async function retrieveEvidence(refs: ReferenceSet, reader: BoundedReader, today: string): Promise<Retrieved> {
  const out: Retrieved = {
    references: refs,
    purchaseOrder: null,
    line: null,
    shipments: [],
    shipmentsSearched: false,
    shipment: null,
    lot: null,
    material: null,
    materialId: null,
    locationId: null,
    inventory: null,
    reservations: null,
    requirements: null,
    requirementWindow: null,
    skipped: [],
  };

  const step = async (label: string, fn: () => Promise<void>) => {
    if (out.skipped.length > 0) {
      out.skipped.push(label);
      return;
    }
    try {
      await fn();
    } catch (error) {
      if (error instanceof RetrievalBudgetExceededError) out.skipped.push(label);
      else throw error;
    }
  };

  let poId = refs.purchaseOrder ?? null;

  if (refs.shipment) {
    const id = refs.shipment;
    await step(`shipment ${id}`, async () => {
      const record = await reader.shipment(id);
      out.shipment = { key: id, found: record !== null, record };
      if (record && !poId) poId = record.purchaseOrderId;
    });
  }

  if (poId) {
    const id = poId;
    await step(`purchase order ${id}`, async () => {
      const record = await reader.purchaseOrder(id);
      out.purchaseOrder = { key: id, found: record !== null, record };
      if (record) {
        const byMaterial = refs.material ? record.lines.find((l) => l.materialId === refs.material) : undefined;
        out.line = byMaterial ?? (record.lines.length === 1 ? (record.lines[0] ?? null) : null);
      }
    });
    await step(`shipments for ${id}`, async () => {
      out.shipments = await reader.shipmentsForPurchaseOrder(id);
      out.shipmentsSearched = true;
    });
  }

  if (refs.lot) {
    const lot = refs.lot;
    await step(`lot ${lot}`, async () => {
      const rows = await reader.lotBalances(lot);
      out.lot = { key: lot, found: rows.length > 0, record: rows };
    });
  }

  const lotRows = out.lot?.record ?? [];
  out.materialId = refs.material ?? out.line?.materialId ?? (lotRows.length === 1 ? (lotRows[0]?.materialId ?? null) : null);
  out.locationId = out.line?.destinationLocationId ?? (lotRows.length === 1 ? (lotRows[0]?.locationId ?? null) : null);

  if (out.materialId) {
    const materialId = out.materialId;
    await step(`material ${materialId}`, async () => {
      const record = await reader.material(materialId);
      out.material = { key: materialId, found: record !== null, record };
    });
    await step(`inventory for ${materialId}`, async () => {
      out.inventory = await reader.inventory(materialId);
      if (!out.locationId) {
        const locations = new Set(out.inventory.map((b) => b.locationId));
        if (locations.size === 1) out.locationId = [...locations][0] ?? null;
      }
    });
    if (out.locationId) {
      const locationId = out.locationId;
      await step(`reservations for ${materialId} at ${locationId}`, async () => {
        out.reservations = await reader.reservations(materialId, locationId);
      });
    }
    const window = { from: addDays(today, -REQUIREMENT_WINDOW.pastDays), to: addDays(today, REQUIREMENT_WINDOW.futureDays) };
    await step(`requirements for ${materialId}`, async () => {
      const rows = await reader.requirements(materialId, window);
      out.requirements = out.locationId ? rows.filter((r) => r.locationId === out.locationId) : rows;
      out.requirementWindow = window;
    });
  }

  return out;
}
