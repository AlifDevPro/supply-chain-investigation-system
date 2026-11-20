import { z } from "zod";
import { dataModeSchema, isoTimestampSchema } from "./common";

/** Real workflow stages (README 7.1). Order here is the display order. */
export const STAGES = [
  "received",
  "validated",
  "deduplicated",
  "triaged",
  "evidence",
  "impact",
  "case",
  "extraction",
  "review",
  "action",
  "verified",
  "integration",
] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

export const STAGE_LABELS: Record<Stage, string> = {
  received: "Received",
  validated: "Validated",
  deduplicated: "Deduplicated",
  triaged: "Triaged",
  evidence: "Evidence retrieved",
  impact: "Impact calculated",
  case: "Case created",
  extraction: "AI extraction",
  review: "Review",
  action: "Action",
  verified: "Outcome verified",
  integration: "Integration",
};

/** Conventional names from AGENTS.md section 11. The schema is documented in docs/event-schema.md. */
export const eventTypeSchema = z.enum([
  "signal.received",
  "signal.validated",
  "signal.deduplicated",
  "triage.completed",
  "signal.held_for_review",
  "evidence.retrieved",
  "extraction.completed",
  "extraction.failed",
  "impact.calculated",
  "investigation.created",
  "investigation.updated",
  "investigation.needs_review",
  "review.completed",
  "action.approved",
  "action.execution_started",
  "action.execution_completed",
  "action.execution_failed",
  "outcome.verified",
  "tool.called",
  "tool.completed",
  "tool.failed",
  "connector.poll_started",
  "connector.poll_completed",
  "connector.poll_failed",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventStatusSchema = z.enum(["completed", "failed", "retrying", "waiting", "skipped"]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const errorClassSchema = z.enum([
  "validation_error",
  "source_unavailable",
  "timeout",
  "authorization_denied",
  "internal_error",
]);
export type ErrorClass = z.infer<typeof errorClassSchema>;

/** Safe metadata only: no secrets, no message bodies, no source payloads. */
const safeMetadataSchema = z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()]));

export const investigationEventSchema = z.object({
  id: z.string().min(1),
  /** Monotonic per-tenant sequence, used as the tiebreaker for ordering. */
  sequence: z.number().int().nonnegative(),
  tenantId: z.string().min(1),
  caseId: z.string().min(1).nullable(),
  signalId: z.string().min(1).nullable(),
  correlationId: z.string().min(1),
  type: eventTypeSchema,
  stage: stageSchema,
  status: eventStatusSchema,
  /** Server-generated timestamp. */
  occurredAt: isoTimestampSchema,
  /** null means "not measured", never a made-up value. */
  durationMs: z.number().nonnegative().nullable(),
  method: z
    .object({ kind: z.enum(["rule", "model", "system"]), name: z.string().min(1) })
    .nullable(),
  retryCount: z.number().int().nonnegative(),
  errorClass: errorClassSchema.nullable(),
  metadata: safeMetadataSchema,
  dataMode: dataModeSchema,
});
export type InvestigationEvent = z.infer<typeof investigationEventSchema>;
