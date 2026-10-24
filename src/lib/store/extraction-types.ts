import { z } from "zod";
import { EXTRACTION_FIELDS } from "@/lib/ai/extraction-schema";
import type { ExtractionOutcome } from "@/lib/ai/extract";
import type { EventDraft, ListOptions } from "./types";

/** One persisted extraction. Append-only: a re-extraction is a new row. */
export interface StoredExtraction extends ExtractionOutcome {
  tenantId: string;
  id: string;
  signalId: string;
  createdAt: string;
  dataMode: "synthetic";
}

export interface ExtractionKey {
  provider: string;
  model: string;
  promptVersion: string;
}

export interface ExtractionRepository {
  /**
   * Allocates the id (`<signalId>-AI<n>`), stores the extraction and its event in one transaction. The event
   * draft's `signalId` must equal `signalId`.
   */
  record(tenantId: string, signalId: string, outcome: ExtractionOutcome, event: EventDraft): Promise<StoredExtraction>;
  /** Newest extraction per signal, for the given signals of this tenant. */
  latestForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, StoredExtraction>>;
  /** Signals of this tenant that already have a completed extraction for this provider, model and prompt version. */
  completedSignalIds(tenantId: string, key: ExtractionKey): Promise<Set<string>>;
  /** All extractions of this tenant, newest first. */
  listExtractions(tenantId: string, options: ListOptions): Promise<StoredExtraction[]>;
}

const fieldName = z.enum(EXTRACTION_FIELDS);
const scalar = z.union([z.string(), z.number()]);

/** Read-side validation for stored JSON. */
export const storedFieldsSchema = z.array(z.object({ field: fieldName, value: scalar, quote: z.string() }));
export const storedRejectedSchema = z.array(
  z.object({ field: fieldName, code: z.enum(["bad_format", "not_in_source", "value_not_in_quote"]) }),
);
export const storedComparisonSchema = z.array(
  z.object({
    field: fieldName,
    ai: scalar.nullable(),
    rules: scalar.nullable(),
    result: z.enum(["agrees", "differs", "ai_only", "rules_only"]),
  }),
);
