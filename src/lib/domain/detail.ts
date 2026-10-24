import { z } from "zod";
import {
  auditEntrySchema,
  caseSchema,
  deliveryRiskSchema,
  entityEdgeSchema,
  entityNodeSchema,
  impactCalculationSchema,
  proposedActionSchema,
} from "./case";
import { isoTimestampSchema } from "./common";
import { claimSchema, conflictSchema, evidenceItemSchema, unknownItemSchema } from "./evidence";
import { investigationEventSchema } from "./events";
import { signalSchema } from "./signal";

/** One immutable analysis of a persisted case. */
export const runSummarySchema = z.object({
  id: z.string().min(1),
  runNumber: z.number().int().positive(),
  trigger: z.enum(["signal", "related_signal", "operator_open", "operator_rerun", "backfill"]),
  triggerSignalId: z.string().nullable(),
  startedAt: isoTimestampSchema,
  finishedAt: isoTimestampSchema,
  ruleVersions: z.record(z.string(), z.string()),
  retrieval: z.object({
    calls: z.number().int().nonnegative(),
    rows: z.number().int().nonnegative(),
    truncated: z.boolean(),
    budgetExhausted: z.boolean(),
  }),
  counts: z.object({
    evidence: z.number().int().nonnegative(),
    claims: z.number().int().nonnegative(),
    unknowns: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
  }),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const investigationDetailSchema = z.object({
  case: caseSchema,
  /** false when this synthetic dataset has no evidence-level detail for the case. */
  detailAvailable: z.boolean(),
  sourceSignal: signalSchema.nullable(),
  evidence: z.array(evidenceItemSchema),
  claims: z.array(claimSchema),
  impact: impactCalculationSchema.nullable(),
  /** Persisted cases (Phase 3) only. */
  deliveryRisk: deliveryRiskSchema.nullable().optional(),
  unknowns: z.array(unknownItemSchema),
  conflicts: z.array(conflictSchema),
  entities: z.object({ nodes: z.array(entityNodeSchema), edges: z.array(entityEdgeSchema) }),
  actions: z.array(proposedActionSchema),
  events: z.array(investigationEventSchema),
  audit: z.array(auditEntrySchema),
  /** Persisted cases only: run history, newest first. */
  runs: z.array(runSummarySchema).optional(),
  /** Persisted cases only: ids of every linked signal. */
  linkedSignalIds: z.array(z.string()).optional(),
});
export type InvestigationDetail = z.infer<typeof investigationDetailSchema>;
