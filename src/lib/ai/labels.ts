import type { ComparisonResult, RejectionCode } from "./extract";
import type { ExtractionField } from "./extraction-schema";

/** UI wording shared by the submit sheet and the extraction panel. Client-safe: no server imports. */
export type ExtractionDisplayStatus =
  | "completed"
  | "invalid_output"
  | "unavailable"
  | "timeout"
  | "disabled"
  | "skipped"
  | "failed";

export const EXTRACTION_STATUS_TEXT: Record<ExtractionDisplayStatus, string> = {
  completed: "Candidate facts extracted (not used in calculations)",
  invalid_output: "Model output failed validation; nothing from it was kept",
  unavailable: "Model unavailable; the signal is stored without AI extraction",
  timeout: "Model timed out; the signal is stored without AI extraction",
  disabled: "AI extraction is off",
  skipped: "Not eligible for AI extraction",
  failed: "The extraction result could not be stored",
};

export const FIELD_LABELS: Record<ExtractionField, string> = {
  delayDays: "Delay (days)",
  quantity: "Quantity",
  unit: "Unit",
  purchaseOrder: "Purchase order",
  material: "Material",
  shipment: "Shipment",
  lot: "Lot",
  productionOrder: "Production order",
};

export const COMPARISON_TEXT: Record<ComparisonResult, string> = {
  agrees: "Agrees with rules",
  differs: "Differs from rules",
  ai_only: "AI only",
  rules_only: "Rules only",
};

export const REJECTION_TEXT: Record<RejectionCode, string> = {
  bad_format: "wrong format",
  not_in_source: "quote not found in the source",
  value_not_in_quote: "value not in its quote",
};
