import { z } from "zod";
import { claimStateSchema, dataModeSchema, isoTimestampSchema } from "./common";

export const sourceTypeSchema = z.enum([
  "supplier_email",
  "erp_purchase_order",
  "inventory_balance",
  "inventory_reservation",
  "production_order",
  "shipment",
  "quality_record",
  "manual_report",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/** Evidence can also come from master data that is never submitted as a signal. */
export const evidenceSourceTypeSchema = z.enum([...sourceTypeSchema.options, "material_master"]);
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export const extractionMethodSchema = z.enum([
  "system_record",
  "deterministic_rule",
  "ai_extraction",
  "manual_entry",
]);
export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;

/**
 * Evidence is a reference plus a minimal excerpt, not a copy of the source record
 * (AGENTS.md 6.3). A source message is evidence of what the source reported, not
 * proof the reported event occurred.
 */
export const evidenceItemSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  sourceSystem: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceType: evidenceSourceTypeSchema,
  /** Table or collection inside the source system, when known. */
  sourceTable: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  /** Minimal relevant excerpt only. */
  excerpt: z.string().max(600),
  /** Field or content location inside the source record. */
  fieldLocation: z.string().min(1),
  observedAt: isoTimestampSchema,
  sourceReportedAt: isoTimestampSchema.nullable(),
  recordVersion: z.string().min(1),
  extractionMethod: extractionMethodSchema,
  verificationStatus: claimStateSchema,
  dataMode: dataModeSchema,
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const claimSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  statement: z.string().min(1),
  state: claimStateSchema,
  /** Why the claim has this state. */
  basis: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  dataMode: dataModeSchema,
});
export type Claim = z.infer<typeof claimSchema>;

export const unknownItemSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  description: z.string().min(1),
  whyItMatters: z.string().min(1),
  suggestedRetrieval: z.string().min(1),
  dataMode: dataModeSchema,
});
export type UnknownItem = z.infer<typeof unknownItemSchema>;

export const conflictSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  description: z.string().min(1),
  sides: z
    .array(
      z.object({
        evidenceId: z.string().min(1),
        sourceLabel: z.string().min(1),
        reportedValue: z.string().min(1),
      }),
    )
    .min(2),
  dataMode: dataModeSchema,
});
export type Conflict = z.infer<typeof conflictSchema>;
