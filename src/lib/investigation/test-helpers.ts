import type { SignalInput } from "@/lib/domain/signal-input";
import type { TriageResult } from "@/lib/domain/processing";
import { normalizeSignal } from "@/lib/ingestion/normalize";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import type { CaseSignal } from "./signals";
import { syntheticBusinessDataset } from "./seed-records";

/** Test-only builders. */
export const NOW = new Date("2026-10-24T06:00:00.000Z");
export const TENANT = "tenant-a";

export function caseSignal(
  id: string,
  input: Partial<SignalInput> & Pick<SignalInput, "label">,
  triage: Partial<TriageResult> = {},
  receivedAt = NOW.toISOString(),
): CaseSignal {
  const normalized = normalizeSignal({
    sourceType: "supplier_email",
    sourceSystem: "Mailbox (synthetic)",
    dataMode: "synthetic",
    ...input,
  });
  return {
    id,
    receivedAt,
    sourceType: normalized.sourceType,
    sourceSystem: normalized.sourceSystem,
    sourceRecordId: normalized.sourceRecordId,
    normalized,
    triage: {
      outcome: "relevant",
      ruleId: "triage.v1/relevant.delay-with-po",
      ruleVersion: "triage.v1",
      reasonCodes: [],
      requiresReview: false,
      relatedCaseIds: [],
      ...triage,
    },
  };
}

export function seededReader(tenantId = TENANT, now = NOW): InMemoryBusinessRecordReader {
  const reader = new InMemoryBusinessRecordReader();
  reader.load(tenantId, syntheticBusinessDataset(now), now.toISOString());
  return reader;
}
