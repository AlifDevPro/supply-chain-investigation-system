import type { InvestigationEvent } from "@/lib/domain/events";
import type { SignalRecord, TriageResult } from "@/lib/domain/processing";
import type { NormalizedSignal, ReferenceKey, ValidationIssue } from "@/lib/domain/signal-input";
import type { SignalRef } from "@/lib/ingestion/dedupe";

export interface Rejection {
  issues: ValidationIssue[];
  payloadBytes: number;
  /** sha256 of the submitted text, so a rejected payload can be recognized without being stored. */
  payloadSha256: string;
}

/** Full stored signal. The UI reads `SignalRecord`, a strict subset without payloads. */
export interface StoredSignal extends SignalRecord {
  tenantId: string;
  sourceRecordId: string | null;
  normalized: NormalizedSignal | null;
  /** The submitted JSON as parsed, kept separate from `normalized` and never rewritten. */
  raw: unknown;
  contentHash: string | null;
  fingerprint: string | null;
  dedupeRule: string | null;
  possiblyRelated: string[];
  relatedCaseIds: string[];
  triage: TriageResult | null;
  rejection: Rejection | null;
}

export type EventDraft = Omit<InvestigationEvent, "id" | "sequence" | "tenantId">;

export class ForeignKeyViolationError extends Error {}
export class UniqueViolationError extends Error {}

/** Everything inside one atomic unit. Every method is tenant-scoped. */
export interface SignalTx {
  nextSignalId(): Promise<string>;
  /** Serializes concurrent submissions that share a dedupe key until the transaction ends. */
  lockDedupeKey(tenantId: string, key: string): Promise<void>;
  findCanonicalByRecord(tenantId: string, sourceSystem: string, recordId: string): Promise<SignalRef[]>;
  findCanonicalByFingerprint(tenantId: string, fingerprint: string): Promise<SignalRef[]>;
  findCanonicalByReferences(
    tenantId: string,
    references: Partial<Record<ReferenceKey, string>>,
    limit: number,
  ): Promise<SignalRef[]>;
  insertSignal(signal: StoredSignal): Promise<void>;
  insertEvents(tenantId: string, events: readonly EventDraft[]): Promise<InvestigationEvent[]>;
}

export interface ListOptions {
  limit: number;
}

export interface SignalRepository {
  ensureTenant(id: string, name: string): Promise<void>;
  /** All writes happen here. If `fn` throws, nothing is stored. */
  transaction<T>(fn: (tx: SignalTx) => Promise<T>): Promise<T>;
  listSignals(tenantId: string, options: ListOptions): Promise<SignalRecord[]>;
  getSignal(tenantId: string, id: string): Promise<StoredSignal | null>;
  /** Newest first (occurredAt, then sequence). */
  listEvents(tenantId: string, options: ListOptions & { correlationId?: string }): Promise<InvestigationEvent[]>;
  close(): Promise<void>;
}

export function toSignalRecord(s: StoredSignal): SignalRecord {
  return {
    id: s.id,
    correlationId: s.correlationId,
    receivedAt: s.receivedAt,
    sourceType: s.sourceType,
    sourceSystem: s.sourceSystem,
    label: s.label,
    processingStatus: s.processingStatus,
    dedupeStatus: s.dedupeStatus,
    duplicateOf: s.duplicateOf,
    revisionOf: s.revisionOf,
    triageOutcome: s.triageOutcome,
    reasonCodes: s.reasonCodes,
    requiresReview: s.requiresReview,
    ruleVersion: s.ruleVersion,
    caseId: s.caseId,
    dataMode: s.dataMode,
  };
}

export const MAX_LIST_LIMIT = 500;
export const clampLimit = (n: number) => Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(n)));
