import { z } from "zod";

/**
 * Every record in Phase 1 is synthetic. The marker lives in the data itself so a
 * fixture can never be mistaken for operational data by code that forgets the UI label.
 */
export const dataModeSchema = z.literal("synthetic");
export type DataMode = z.infer<typeof dataModeSchema>;

export const isoTimestampSchema = z.iso.datetime({ offset: true });

/** Claim and verification states. Deliberately not collapsed into one score (AGENTS.md 6.2). */
export const claimStateSchema = z.enum([
  "verified",
  "reported",
  "inferred",
  "assumed",
  "unknown",
  "conflicted",
  "stale",
]);
export type ClaimState = z.infer<typeof claimStateSchema>;

export const CLAIM_STATES = claimStateSchema.options;

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof severitySchema>;

/** Case lifecycle from README section 8. */
export const caseStateSchema = z.enum([
  "received",
  "triaging",
  "investigating",
  "needs_review",
  "awaiting_approval",
  "approved",
  "executing",
  "awaiting_verification",
  "resolved",
  "rejected",
  "dismissed",
  "failed",
  "cancelled",
  "blocked",
]);
export type CaseState = z.infer<typeof caseStateSchema>;

export const unitSchema = z.enum(["m", "yd", "kg", "pcs"]);
export type Unit = z.infer<typeof unitSchema>;
