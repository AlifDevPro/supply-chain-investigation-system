import { z } from "zod";
import { isoDateSchema } from "@/lib/domain/case";
import { isoTimestampSchema, unitSchema } from "@/lib/domain/common";

/**
 * Typed views of the SYNTHETIC business records (supabase/migrations/0002_business_records.sql).
 * Every record carries provenance (`meta`) so evidence can point at the exact row and version it came from.
 * Reader implementations validate rows against these schemas; a malformed row is an error, not a guess.
 */
export const recordMetaSchema = z.object({
  sourceTable: z.string().min(1),
  recordId: z.string().min(1),
  recordVersion: z.number().int().positive(),
  updatedAt: isoTimestampSchema,
});
export type RecordMeta = z.infer<typeof recordMetaSchema>;

export const materialRecordSchema = z.object({
  meta: recordMetaSchema,
  id: z.string().min(1),
  description: z.string().min(1),
  variant: z.string().min(1),
  baseUnit: unitSchema,
});
export type MaterialRecord = z.infer<typeof materialRecordSchema>;

export const poLineRecordSchema = z.object({
  meta: recordMetaSchema,
  purchaseOrderId: z.string().min(1),
  lineNo: z.number().int().positive(),
  materialId: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: unitSchema,
  promisedDate: isoDateSchema,
  destinationLocationId: z.string().min(1),
});
export type PoLineRecord = z.infer<typeof poLineRecordSchema>;

export const purchaseOrderRecordSchema = z.object({
  meta: recordMetaSchema,
  id: z.string().min(1),
  supplierId: z.string().min(1),
  supplierName: z.string().min(1),
  status: z.enum(["open", "partially_received", "received", "cancelled"]),
  lines: z.array(poLineRecordSchema),
});
export type PurchaseOrderRecord = z.infer<typeof purchaseOrderRecordSchema>;

export const inventoryBalanceRecordSchema = z.object({
  meta: recordMetaSchema,
  id: z.string().min(1),
  materialId: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  lot: z.string().nullable(),
  onHand: z.number().nonnegative(),
  unit: unitSchema,
  qualityStatus: z.enum(["released", "hold", "unknown"]),
  countedAt: isoTimestampSchema,
});
export type InventoryBalanceRecord = z.infer<typeof inventoryBalanceRecordSchema>;

export const reservationRecordSchema = z.object({
  meta: recordMetaSchema,
  id: z.string().min(1),
  materialId: z.string().min(1),
  locationId: z.string().min(1),
  productionOrderId: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: unitSchema,
});
export type ReservationRecord = z.infer<typeof reservationRecordSchema>;

export const requirementRecordSchema = z.object({
  meta: recordMetaSchema,
  productionOrderId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: unitSchema,
  requiredBy: isoDateSchema,
  locationId: z.string().min(1),
  orderStatus: z.enum(["planned", "released", "in_progress", "completed", "cancelled"]),
});
export type RequirementRecord = z.infer<typeof requirementRecordSchema>;

export const shipmentRecordSchema = z.object({
  meta: recordMetaSchema,
  id: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  status: z.enum(["booked", "in_transit", "delayed", "delivered", "cancelled"]),
  eta: isoDateSchema.nullable(),
  quantity: z.number().nonnegative().nullable(),
  unit: unitSchema.nullable(),
});
export type ShipmentRecord = z.infer<typeof shipmentRecordSchema>;

/** Business-record reads never return more than this many rows per call. */
export const MAX_ROWS_PER_CALL = 20;
