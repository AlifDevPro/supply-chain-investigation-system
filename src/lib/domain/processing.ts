import { z } from "zod";
import { dataModeSchema, isoTimestampSchema } from "./common";
import { sourceTypeSchema } from "./evidence";
import { triageOutcomeSchema } from "./signal";

/** What happened to a submitted signal. A signal is never silently dropped. */
export const processingStatusSchema = z.enum(["rejected", "duplicate", "triaged", "held_for_review"]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const dedupeStatusSchema = z.enum(["unique", "duplicate", "revision"]);
export type DedupeStatus = z.infer<typeof dedupeStatusSchema>;

export const TRIAGE_REASON_CODES = [
  "quality_inspection_failed",
  "quantity_over_threshold",
  "matches_open_case_reference",
  "routine_inventory_sync",
  "delay_language_with_po",
  "no_rule_matched",
  "no_disruption_language",
  "hedged_language",
  "no_purchase_order_reference",
  "missing_quantity",
  "conflicting_attributes",
  "revision_of_earlier_signal",
  "possibly_related_signal",
] as const;
export const triageReasonCodeSchema = z.enum(TRIAGE_REASON_CODES);
export type TriageReasonCode = z.infer<typeof triageReasonCodeSchema>;

export const triageResultSchema = z.object({
  outcome: triageOutcomeSchema,
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  reasonCodes: z.array(triageReasonCodeSchema),
  requiresReview: z.boolean(),
  /** Open cases whose references matched. Linking a signal to a case is Phase 3. */
  relatedCaseIds: z.array(z.string().min(1)),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

/**
 * Read model used by the UI. Everything that can be unknown for a rejected or fixture signal is nullable,
 * so "not recorded" is never displayed as a made-up value.
 */
export const signalRecordSchema = z.object({
  id: z.string().min(1),
  correlationId: z.string().min(1),
  receivedAt: isoTimestampSchema,
  sourceType: sourceTypeSchema.nullable(),
  sourceSystem: z.string().nullable(),
  label: z.string().nullable(),
  processingStatus: processingStatusSchema,
  dedupeStatus: dedupeStatusSchema.nullable(),
  duplicateOf: z.string().nullable(),
  revisionOf: z.string().nullable(),
  triageOutcome: triageOutcomeSchema.nullable(),
  reasonCodes: z.array(z.string()),
  requiresReview: z.boolean(),
  ruleVersion: z.string().nullable(),
  caseId: z.string().nullable(),
  dataMode: dataModeSchema,
});
export type SignalRecord = z.infer<typeof signalRecordSchema>;
