import { z } from "zod";
import { dataModeSchema, isoTimestampSchema } from "./common";
import { sourceTypeSchema } from "./evidence";

export const triageOutcomeSchema = z.enum([
  "irrelevant",
  "relevant",
  "uncertain",
  "related_existing",
  "high_impact",
]);
export type TriageOutcome = z.infer<typeof triageOutcomeSchema>;

export const signalSchema = z.object({
  id: z.string().min(1),
  sourceType: sourceTypeSchema,
  sourceSystem: z.string().min(1),
  /** Short, non-sensitive label. Never the full message body. */
  label: z.string().min(1),
  receivedAt: isoTimestampSchema,
  triageOutcome: triageOutcomeSchema,
  caseId: z.string().nullable(),
  correlationId: z.string().min(1),
  dataMode: dataModeSchema,
});
export type Signal = z.infer<typeof signalSchema>;
