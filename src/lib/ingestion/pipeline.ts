import type { EventType, Stage } from "@/lib/domain/events";
import type { TriageResult } from "@/lib/domain/processing";
import type { NormalizedSignal, ReferenceKey, ValidationIssue } from "@/lib/domain/signal-input";
import { REFERENCE_KEYS } from "@/lib/domain/signal-input";
import {
  UniqueViolationError,
  type EventDraft,
  type SignalRepository,
  type SignalTx,
  type StoredSignal,
} from "@/lib/store/types";
import { decideDedupe, DEDUPE_VERSION, MAX_POSSIBLY_RELATED, type DedupeDecision } from "./dedupe";
import { contentHash, fingerprint, sha256 } from "./hash";
import { normalizeSignal } from "./normalize";
import { triageSignal, TRIAGE_VERSION, type CaseReferenceIndex, type CaseReferenceSource } from "./triage";
import { validateRawSignal } from "./validate";

export interface Clock {
  /** Wall clock for server-generated timestamps. */
  now(): Date;
  /** Monotonic milliseconds for measuring durations. Not affected by clock changes. */
  monotonicMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  monotonicMs: () => performance.now(),
};

export interface PipelineDeps {
  repo: SignalRepository;
  caseIndex: CaseReferenceSource;
  clock?: Clock;
}

export type ProcessOutcome =
  | { kind: "rejected"; signalId: string; correlationId: string; issues: ValidationIssue[] }
  | { kind: "duplicate"; signalId: string; correlationId: string; dedupe: DedupeDecision }
  | {
      kind: "accepted";
      signalId: string;
      correlationId: string;
      dedupe: DedupeDecision;
      triage: TriageResult;
      requiresReview: boolean;
    };

const duration = (ms: number) => Math.max(0, Math.round(ms));
const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

function referenceProbe(n: NormalizedSignal): Partial<Record<ReferenceKey, string>> {
  const out: Partial<Record<ReferenceKey, string>> = {};
  for (const key of REFERENCE_KEYS) {
    const value = n.references[key];
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * The single path from raw submitted text to a stored, explained outcome.
 * The signal row and its events commit together or not at all. Every submission, including a rejected one,
 * leaves a visible record; nothing is silently dropped. No AI model is involved.
 */
export async function processSignal(tenantId: string, rawText: string, deps: PipelineDeps): Promise<ProcessOutcome> {
  const clock = deps.clock ?? systemClock;
  const receivedAt = clock.now();
  const startedMs = clock.monotonicMs();

  const validationStart = clock.monotonicMs();
  const validation = validateRawSignal(rawText);
  const normalized = validation.ok ? normalizeSignal(validation.input) : null;
  const validatedMs = duration(clock.monotonicMs() - validationStart);
  const validatedAt = clock.now();

  // Read once, before the transaction: relating a signal to a case is advisory at triage. The case decision
  // itself is re-checked under a lock when the investigation runs.
  const openCases = normalized ? await deps.caseIndex.openCases() : [];
  const caseIndex: CaseReferenceIndex = { openCases: () => openCases };
  const attempt = () =>
    deps.repo.transaction((tx) =>
      persist(tx, { tenantId, rawText, validation, normalized, receivedAt, validatedAt, validatedMs, startedMs, caseIndex, clock }),
    );

  try {
    return await attempt();
  } catch (error) {
    // The advisory lock normally prevents this; the unique index is the backstop. Retry once: the second
    // pass sees the winning row and classifies this submission as a duplicate.
    if (error instanceof UniqueViolationError) return attempt();
    throw error;
  }
}

interface PersistInput {
  tenantId: string;
  rawText: string;
  validation: ReturnType<typeof validateRawSignal>;
  normalized: NormalizedSignal | null;
  receivedAt: Date;
  validatedAt: Date;
  validatedMs: number;
  startedMs: number;
  caseIndex: CaseReferenceIndex;
  clock: Clock;
}

async function persist(tx: SignalTx, input: PersistInput): Promise<ProcessOutcome> {
  const { tenantId, validation, normalized, clock } = input;
  const signalId = await tx.nextSignalId();
  const correlationId = `corr-${signalId.replace(/^SIG-/, "")}`;
  const drafts: EventDraft[] = [];

  const push = (
    type: EventType,
    stage: Stage,
    status: EventDraft["status"],
    at: Date,
    durationMs: number | null,
    extra: Partial<Pick<EventDraft, "method" | "errorClass" | "metadata">> = {},
  ) => {
    drafts.push({
      caseId: null,
      signalId,
      correlationId,
      type,
      stage,
      status,
      occurredAt: at.toISOString(),
      durationMs,
      method: extra.method ?? null,
      retryCount: 0,
      errorClass: extra.errorClass ?? null,
      metadata: extra.metadata ?? {},
      dataMode: "synthetic",
    });
  };

  push("signal.received", "received", "completed", input.receivedAt, null, {
    method: { kind: "system", name: "ingest" },
    metadata: { payloadBytes: validation.bytes },
  });

  // ---- Rejected ----------------------------------------------------------------------------------------
  if (!validation.ok || normalized === null) {
    const issues = validation.ok ? [] : validation.issues;
    push("signal.validated", "validated", "failed", input.validatedAt, input.validatedMs, {
      method: { kind: "rule", name: "schema-validation" },
      errorClass: "validation_error",
      metadata: {
        issueCount: issues.length,
        fields: clip(issues.map((i) => i.path || "(body)").join(",")),
        codes: clip([...new Set(issues.map((i) => i.code))].join(",")),
      },
    });
    const rejected: StoredSignal = {
      id: signalId,
      tenantId,
      correlationId,
      receivedAt: input.receivedAt.toISOString(),
      sourceType: null,
      sourceSystem: null,
      label: null,
      sourceRecordId: null,
      processingStatus: "rejected",
      dedupeStatus: null,
      duplicateOf: null,
      revisionOf: null,
      triageOutcome: null,
      reasonCodes: [],
      requiresReview: false,
      ruleVersion: null,
      caseId: null,
      dataMode: "synthetic",
      normalized: null,
      raw: null,
      contentHash: null,
      fingerprint: null,
      dedupeRule: null,
      possiblyRelated: [],
      relatedCaseIds: [],
      triage: null,
      // Payload text is deliberately not stored: only its size, hash and the field-level errors.
      rejection: { issues, payloadBytes: validation.bytes, payloadSha256: sha256(input.rawText) },
    };
    await tx.insertSignal(rejected);
    await tx.insertEvents(tenantId, drafts);
    return { kind: "rejected", signalId, correlationId, issues };
  }

  // ---- Validated ---------------------------------------------------------------------------------------
  push("signal.validated", "validated", "completed", input.validatedAt, input.validatedMs, {
    method: { kind: "rule", name: "schema-validation" },
    metadata: { normalized: true, sourceType: normalized.sourceType, hasRecordId: normalized.sourceRecordId !== null },
  });

  // ---- Deduplicate -------------------------------------------------------------------------------------
  const dedupeStart = clock.monotonicMs();
  const hash = contentHash(normalized);
  const print = fingerprint(normalized);
  await tx.lockDedupeKey(
    tenantId,
    normalized.sourceRecordId ? `rec|${normalized.sourceSystem}|${normalized.sourceRecordId}` : `fp|${print}`,
  );
  const sameRecord = normalized.sourceRecordId
    ? await tx.findCanonicalByRecord(tenantId, normalized.sourceSystem, normalized.sourceRecordId)
    : [];
  const sameFingerprint = normalized.sourceRecordId ? [] : await tx.findCanonicalByFingerprint(tenantId, print);
  const probe = referenceProbe(normalized);
  const sharedReferences = await tx.findCanonicalByReferences(tenantId, probe, MAX_POSSIBLY_RELATED * 4);
  const dedupe = decideDedupe(
    { normalized, contentHash: hash, fingerprint: print, now: input.receivedAt },
    { sameRecord, sameFingerprint, sharedReferences },
  );
  const dedupedAt = clock.now();
  push("signal.deduplicated", "deduplicated", "completed", dedupedAt, duration(clock.monotonicMs() - dedupeStart), {
    method: { kind: "rule", name: DEDUPE_VERSION },
    metadata: {
      duplicate: dedupe.status === "duplicate",
      status: dedupe.status,
      rule: dedupe.rule,
      ...(dedupe.duplicateOf ? { duplicateOf: dedupe.duplicateOf } : {}),
      ...(dedupe.revisionOf ? { revisionOf: dedupe.revisionOf } : {}),
      possiblyRelated: dedupe.possiblyRelated.length,
    },
  });

  const base = {
    id: signalId,
    tenantId,
    correlationId,
    receivedAt: input.receivedAt.toISOString(),
    sourceType: normalized.sourceType,
    sourceSystem: normalized.sourceSystem,
    label: normalized.label,
    sourceRecordId: normalized.sourceRecordId,
    dedupeStatus: dedupe.status,
    duplicateOf: dedupe.duplicateOf,
    revisionOf: dedupe.revisionOf,
    caseId: null,
    dataMode: "synthetic" as const,
    normalized,
    raw: validation.input,
    contentHash: hash,
    fingerprint: print,
    dedupeRule: dedupe.rule,
    possiblyRelated: dedupe.possiblyRelated,
  };

  if (dedupe.status === "duplicate") {
    await tx.insertSignal({
      ...base,
      processingStatus: "duplicate",
      triageOutcome: null,
      reasonCodes: [],
      requiresReview: false,
      ruleVersion: null,
      relatedCaseIds: [],
      triage: null,
      rejection: null,
    });
    await tx.insertEvents(tenantId, drafts);
    return { kind: "duplicate", signalId, correlationId, dedupe };
  }

  // ---- Triage ------------------------------------------------------------------------------------------
  const triageStart = clock.monotonicMs();
  const triage = triageSignal(normalized, dedupe, input.caseIndex);
  push("triage.completed", "triaged", "completed", clock.now(), duration(clock.monotonicMs() - triageStart), {
    method: { kind: "rule", name: TRIAGE_VERSION },
    metadata: {
      outcome: triage.outcome,
      ruleId: triage.ruleId,
      reasons: clip(triage.reasonCodes.join(",")),
      requiresReview: triage.requiresReview,
      ...(triage.relatedCaseIds.length > 0 ? { relatedCases: clip(triage.relatedCaseIds.join(",")) } : {}),
    },
  });
  if (triage.requiresReview) {
    push("signal.held_for_review", "review", "waiting", clock.now(), null, {
      method: { kind: "system", name: "review-hold" },
      metadata: { outcome: triage.outcome, reasons: clip(triage.reasonCodes.join(",")) },
    });
  }

  await tx.insertSignal({
    ...base,
    processingStatus: triage.requiresReview ? "held_for_review" : "triaged",
    triageOutcome: triage.outcome,
    reasonCodes: triage.reasonCodes,
    requiresReview: triage.requiresReview,
    ruleVersion: triage.ruleVersion,
    relatedCaseIds: triage.relatedCaseIds,
    triage,
    rejection: null,
  });
  await tx.insertEvents(tenantId, drafts);
  return { kind: "accepted", signalId, correlationId, dedupe, triage, requiresReview: triage.requiresReview };
}
