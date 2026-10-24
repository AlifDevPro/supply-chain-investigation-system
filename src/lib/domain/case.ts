import { z } from "zod";
import {
  caseStateSchema,
  claimStateSchema,
  dataModeSchema,
  isoTimestampSchema,
  severitySchema,
  unitSchema,
} from "./common";

export const impactInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** null = the value is missing. Missing values are never replaced by guesses. */
  value: z.number().nullable(),
  unit: unitSchema.nullable(),
  state: claimStateSchema,
  evidenceId: z.string().nullable(),
  note: z.string().nullable(),
});
export type ImpactInput = z.infer<typeof impactInputSchema>;

/** Output of the deterministic calculation (src/lib/impact). Components only display it. */
export const impactCalculationSchema = z.object({
  ruleVersion: z.string().min(1),
  method: z.string().min(1),
  calculatedAt: isoTimestampSchema,
  /** Unit of every quantity in the result. */
  unit: unitSchema,
  /** null when the calculation cannot be performed. */
  deficit: z.number().nullable(),
  /** Quantity considered usable for this requirement; null if not calculable. */
  usableQuantity: z.number().nullable(),
  requiredQuantity: z.number().nullable(),
  status: z.enum(["verified", "provisional", "incalculable"]),
  inputs: z.array(impactInputSchema),
  assumptions: z.array(z.string()),
  /** What must be retrieved or verified before this can be treated as confirmed. */
  missing: z.array(z.string()),
  conflicts: z.array(z.string()),
});
export type ImpactCalculationResult = z.infer<typeof impactCalculationSchema>;

/** Output of the deterministic delivery-risk calculation (src/lib/impact/delivery-risk.ts). */
export const isoDateSchema = z.iso.date();

export const deliveryRiskSchema = z.object({
  ruleVersion: z.string().min(1),
  method: z.string().min(1),
  calculatedAt: isoTimestampSchema,
  status: z.enum(["verified", "provisional", "incalculable"]),
  promisedDate: isoDateSchema.nullable(),
  expectedArrival: isoDateSchema.nullable(),
  /** Where the expected arrival date comes from. */
  arrivalBasis: z.enum(["shipment_eta", "reported_delay", "promised_date", "none"]),
  /** Calendar days between promised date and expected arrival (UTC dates). Positive = late. */
  delayDays: z.number().int().nullable(),
  earliestRequiredBy: isoDateSchema.nullable(),
  /** Calendar days from expected arrival to the earliest requirement. Negative = arrives after it is needed. */
  slackDays: z.number().int().nullable(),
  affectedOrders: z.array(
    z.object({
      productionOrderId: z.string().min(1),
      requiredBy: isoDateSchema,
      quantity: z.number().nonnegative(),
      unit: unitSchema,
      evidenceId: z.string().nullable(),
    }),
  ),
  inputs: z.array(impactInputSchema),
  assumptions: z.array(z.string()),
  missing: z.array(z.string()),
  conflicts: z.array(z.string()),
});
export type DeliveryRiskResult = z.infer<typeof deliveryRiskSchema>;

export const caseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  state: caseStateSchema,
  severity: severitySchema,
  ownerName: z.string().min(1),
  ownerRole: z.string().min(1),
  nextAction: z.string().min(1),
  requiresReview: z.boolean(),
  reviewReason: z.string().nullable(),
  openedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  /** Short impact line shown in tables. Derived from the calculation, never typed by hand for the main case. */
  impactLabel: z.string().min(1),
  impactStatus: z.enum(["verified", "provisional", "incalculable", "none"]),
  /** Present when the case concerns a material deficit. Comes from the deterministic calculation. */
  shortage: z
    .object({
      quantity: z.number().nullable(),
      unit: unitSchema,
      status: z.enum(["verified", "provisional", "incalculable"]),
    })
    .nullable(),
  /** Ordered list of overall verification posture, summarised from claims. */
  claimSummary: z.object({
    verified: z.number().int().nonnegative(),
    reported: z.number().int().nonnegative(),
    inferred: z.number().int().nonnegative(),
    assumed: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    conflicted: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  }),
  affectedOrders: z.number().int().nonnegative(),
  dataMode: dataModeSchema,
});
export type InvestigationCase = z.infer<typeof caseSchema>;

export const entityKindSchema = z.enum([
  "supplier",
  "purchase_order",
  "material",
  "production_order",
  "factory",
  "shipment",
]);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const entityNodeSchema = z.object({
  id: z.string().min(1),
  kind: entityKindSchema,
  label: z.string().min(1),
  detail: z.string().min(1),
  evidenceId: z.string().nullable(),
});
export type EntityNode = z.infer<typeof entityNodeSchema>;

export const entityEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relationship: z.enum(["verified", "inferred"]),
  basis: z.string().min(1),
});
export type EntityEdge = z.infer<typeof entityEdgeSchema>;

export const proposedActionSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  title: z.string().min(1),
  /** Exact parameters an approval would apply to. Changing them invalidates an approval. */
  parameters: z.array(z.object({ label: z.string(), value: z.string() })),
  rationale: z.string().min(1),
  origin: z.enum(["ai_suggested", "rule_suggested"]),
  status: z.enum(["proposed", "awaiting_approval", "approved", "rejected", "executing", "executed", "failed", "outcome_verified"]),
  version: z.number().int().positive(),
  requiredRole: z.string().min(1),
  dataMode: dataModeSchema,
});
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const auditEntrySchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  at: isoTimestampSchema,
  actor: z.string().min(1),
  action: z.string().min(1),
  detail: z.string().min(1),
  dataMode: dataModeSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
