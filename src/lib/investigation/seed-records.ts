import type { Unit } from "@/lib/domain";
import { addDays } from "@/lib/impact/dates";

/**
 * SYNTHETIC business records for development and demos. Dates are relative to the seeding day so the
 * scenarios stay meaningful. Nothing here describes a real supplier, factory or order.
 *
 * Scenarios (aligned with the seed signals in src/lib/ingestion/seed.ts):
 *  - PO-77210 trim: shipment ETA two days late; one production order needs it first; verified inputs.
 *  - PO-77305 lining: no shipment record; stale inventory with unknown quality status.
 *  - PO-77410 navy twill (the README example): 8,000 m reported four days late, 6,000 m required before
 *    arrival, 500 m on hand with unknown quality status, so the shortage stays provisional.
 *  - Lot WL-3301 labels: on quality hold; a production order needs labels within the week.
 *  - SHP-30871: a delayed shipment for PO-77120 navy drill.
 */
export interface BusinessDataset {
  suppliers: Array<{ id: string; name: string }>;
  materials: Array<{ id: string; description: string; variant: string; baseUnit: Unit }>;
  locations: Array<{ id: string; name: string; kind: "factory" | "warehouse" }>;
  purchaseOrders: Array<{ id: string; supplierId: string; status: "open" | "partially_received" | "received" | "cancelled" }>;
  poLines: Array<{ purchaseOrderId: string; lineNo: number; materialId: string; quantity: number; unit: Unit; promisedDate: string; destinationLocationId: string }>;
  productionOrders: Array<{ id: string; locationId: string; dueDate: string; status: "planned" | "released" | "in_progress" | "completed" | "cancelled" }>;
  requirements: Array<{ productionOrderId: string; materialId: string; quantity: number; unit: Unit; requiredBy: string }>;
  balances: Array<{ id: string; materialId: string; locationId: string; lot: string | null; onHand: number; unit: Unit; qualityStatus: "released" | "hold" | "unknown"; countedAt: string }>;
  reservations: Array<{ id: string; materialId: string; locationId: string; productionOrderId: string; quantity: number; unit: Unit }>;
  shipments: Array<{ id: string; purchaseOrderId: string; status: "booked" | "in_transit" | "delayed" | "delivered" | "cancelled"; eta: string | null; quantity: number | null; unit: Unit | null }>;
}

export function syntheticBusinessDataset(now: Date): BusinessDataset {
  const D = now.toISOString().slice(0, 10);
  const day = (n: number) => addDays(D, n);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  return {
    suppliers: [
      { id: "SUP-101", name: "Kestrel Trims (synthetic)" },
      { id: "SUP-102", name: "Northline Textiles (synthetic)" },
      { id: "SUP-103", name: "Indigo Mills (synthetic)" },
      { id: "SUP-104", name: "Label Works (synthetic)" },
    ],
    materials: [
      { id: "TR-5502", description: "Grosgrain trim", variant: "black, 12 mm", baseUnit: "m" },
      { id: "LN-2210", description: "Polyester lining", variant: "white, 150 cm, 70 gsm", baseUnit: "m" },
      { id: "NV-4410", description: "Navy cotton twill", variant: "navy 19-4024, 240 gsm, 150 cm", baseUnit: "m" },
      { id: "NV-4471", description: "Navy cotton drill", variant: "navy 19-4024, 280 gsm, 150 cm", baseUnit: "m" },
      { id: "WL-0420", description: "Woven main label", variant: "brand A, 40 x 20 mm", baseUnit: "pcs" },
    ],
    locations: [
      { id: "FAC-1", name: "Cutting & Sewing Unit 1 (synthetic)", kind: "factory" },
      { id: "WH-1", name: "Central Fabric Warehouse (synthetic)", kind: "warehouse" },
    ],
    purchaseOrders: [
      { id: "PO-77210", supplierId: "SUP-101", status: "open" },
      { id: "PO-77305", supplierId: "SUP-102", status: "open" },
      { id: "PO-77410", supplierId: "SUP-103", status: "open" },
      { id: "PO-77120", supplierId: "SUP-103", status: "open" },
    ],
    poLines: [
      { purchaseOrderId: "PO-77210", lineNo: 1, materialId: "TR-5502", quantity: 1200, unit: "m", promisedDate: day(3), destinationLocationId: "FAC-1" },
      { purchaseOrderId: "PO-77305", lineNo: 1, materialId: "LN-2210", quantity: 12000, unit: "m", promisedDate: day(6), destinationLocationId: "FAC-1" },
      { purchaseOrderId: "PO-77410", lineNo: 1, materialId: "NV-4410", quantity: 8000, unit: "m", promisedDate: day(2), destinationLocationId: "FAC-1" },
      { purchaseOrderId: "PO-77120", lineNo: 1, materialId: "NV-4471", quantity: 3000, unit: "m", promisedDate: day(-1), destinationLocationId: "FAC-1" },
    ],
    productionOrders: [
      { id: "PRD-5101", locationId: "FAC-1", dueDate: day(9), status: "released" },
      { id: "PRD-5102", locationId: "FAC-1", dueDate: day(25), status: "planned" },
      { id: "PRD-5103", locationId: "FAC-1", dueDate: day(12), status: "released" },
      { id: "PRD-5104", locationId: "FAC-1", dueDate: day(18), status: "planned" },
      { id: "PRD-5105", locationId: "FAC-1", dueDate: day(8), status: "released" },
      { id: "PRD-5106", locationId: "FAC-1", dueDate: day(10), status: "released" },
      { id: "PRD-5107", locationId: "FAC-1", dueDate: day(35), status: "planned" },
      { id: "PRD-5108", locationId: "FAC-1", dueDate: day(6), status: "in_progress" },
    ],
    requirements: [
      { productionOrderId: "PRD-5101", materialId: "TR-5502", quantity: 1000, unit: "m", requiredBy: day(4) },
      { productionOrderId: "PRD-5102", materialId: "TR-5502", quantity: 400, unit: "m", requiredBy: day(20) },
      { productionOrderId: "PRD-5103", materialId: "LN-2210", quantity: 6000, unit: "m", requiredBy: day(7) },
      { productionOrderId: "PRD-5104", materialId: "LN-2210", quantity: 4000, unit: "m", requiredBy: day(12) },
      { productionOrderId: "PRD-5105", materialId: "WL-0420", quantity: 1500, unit: "pcs", requiredBy: day(5) },
      { productionOrderId: "PRD-5106", materialId: "NV-4410", quantity: 6000, unit: "m", requiredBy: day(5) },
      { productionOrderId: "PRD-5107", materialId: "NV-4410", quantity: 1500, unit: "m", requiredBy: day(30) },
      { productionOrderId: "PRD-5108", materialId: "NV-4471", quantity: 2500, unit: "m", requiredBy: day(1) },
    ],
    balances: [
      { id: "BAL-1001", materialId: "TR-5502", locationId: "FAC-1", lot: null, onHand: 300, unit: "m", qualityStatus: "released", countedAt: hoursAgo(2) },
      { id: "BAL-1002", materialId: "LN-2210", locationId: "FAC-1", lot: null, onHand: 500, unit: "m", qualityStatus: "unknown", countedAt: hoursAgo(72) },
      { id: "BAL-1003", materialId: "LN-2210", locationId: "WH-1", lot: null, onHand: 3000, unit: "m", qualityStatus: "released", countedAt: hoursAgo(5) },
      { id: "BAL-1004", materialId: "NV-4410", locationId: "FAC-1", lot: null, onHand: 500, unit: "m", qualityStatus: "unknown", countedAt: hoursAgo(1) },
      { id: "BAL-1005", materialId: "WL-0420", locationId: "FAC-1", lot: "WL-3301", onHand: 2000, unit: "pcs", qualityStatus: "hold", countedAt: hoursAgo(4) },
      { id: "BAL-1006", materialId: "NV-4471", locationId: "FAC-1", lot: null, onHand: 900, unit: "m", qualityStatus: "released", countedAt: hoursAgo(1) },
    ],
    reservations: [
      { id: "RSV-2001", materialId: "TR-5502", locationId: "FAC-1", productionOrderId: "PRD-5102", quantity: 150, unit: "m" },
      { id: "RSV-2002", materialId: "NV-4410", locationId: "FAC-1", productionOrderId: "PRD-5107", quantity: 200, unit: "m" },
    ],
    shipments: [
      { id: "SHP-40110", purchaseOrderId: "PO-77210", status: "in_transit", eta: day(5), quantity: 1200, unit: "m" },
      { id: "SHP-30871", purchaseOrderId: "PO-77120", status: "delayed", eta: day(2), quantity: 3000, unit: "m" },
    ],
  };
}
