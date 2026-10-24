import { z } from "zod";
import { dataModeSchema, isoTimestampSchema, unitSchema, type Unit } from "./common";
import { sourceTypeSchema } from "./evidence";

/** Maximum accepted payload size, in bytes. Enforced by the HTTP layer and again by the pipeline. */
export const MAX_PAYLOAD_BYTES = 16 * 1024;

const UNIT_SYNONYMS: Record<string, Unit> = {
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  yd: "yd",
  yds: "yd",
  yard: "yd",
  yards: "yd",
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  unit: "pcs",
  units: "pcs",
};

/** Maps a unit spelling to a canonical unit, or null when unsupported. No unit conversion happens here. */
export function normalizeUnit(raw: string): Unit | null {
  const parsed = unitSchema.safeParse(UNIT_SYNONYMS[raw.trim().toLowerCase()]);
  return parsed.success ? parsed.data : null;
}

const referenceValue = z.string().trim().min(1).max(64);

/**
 * Strict input contract for a signal submitted by a source adapter (AGENTS.md 5.3).
 * Unknown keys are rejected. Free text is data, never instructions.
 */
export const signalInputSchema = z.strictObject({
  sourceType: sourceTypeSchema,
  sourceSystem: z.string().trim().min(1).max(80),
  sourceRecordId: z.string().trim().min(1).max(120).optional(),
  sourceReportedAt: isoTimestampSchema.optional(),
  label: z.string().trim().min(1).max(200),
  excerpt: z.string().max(600).optional(),
  references: z
    .strictObject({
      purchaseOrder: referenceValue.optional(),
      material: referenceValue.optional(),
      shipment: referenceValue.optional(),
      lot: referenceValue.optional(),
      productionOrder: referenceValue.optional(),
    })
    .optional(),
  quantity: z
    .strictObject({
      value: z.number().finite().nonnegative(),
      unit: z
        .string()
        .max(16)
        .refine((u) => normalizeUnit(u) !== null, { params: { code: "unsupported_unit" } }),
    })
    .optional(),
  attributes: z
    .strictObject({
      inspectionResult: z.enum(["passed", "failed", "unknown"]).optional(),
      routineSync: z.boolean().optional(),
      varianceDetected: z.boolean().optional(),
    })
    .optional(),
  dataMode: dataModeSchema,
});
export type SignalInput = z.infer<typeof signalInputSchema>;

export const REFERENCE_KEYS = ["purchaseOrder", "material", "shipment", "lot", "productionOrder"] as const;
export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

/**
 * Normalized form. Every optional field is explicitly `null` when absent so a missing value stays
 * visible and is never silently defaulted (AGENTS.md 6.4).
 */
export const normalizedSignalSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceSystem: z.string().min(1),
  sourceRecordId: z.string().nullable(),
  sourceReportedAt: isoTimestampSchema.nullable(),
  label: z.string().min(1),
  excerpt: z.string().nullable(),
  references: z.object({
    purchaseOrder: z.string().nullable(),
    material: z.string().nullable(),
    shipment: z.string().nullable(),
    lot: z.string().nullable(),
    productionOrder: z.string().nullable(),
  }),
  quantity: z.object({ value: z.number().finite().nonnegative(), unit: unitSchema }).nullable(),
  attributes: z.object({
    inspectionResult: z.enum(["passed", "failed", "unknown"]).nullable(),
    routineSync: z.boolean().nullable(),
    varianceDetected: z.boolean().nullable(),
  }),
  dataMode: dataModeSchema,
});
export type NormalizedSignal = z.infer<typeof normalizedSignalSchema>;

/** A safe description of one validation problem: where, and what kind. Never the submitted value. */
export interface ValidationIssue {
  path: string;
  code: string;
}
