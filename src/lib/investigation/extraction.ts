import type { AiConfig } from "@/lib/ai/config";
import { extractSignalFacts, type ExtractionOutcome, type ExtractionStatus } from "@/lib/ai/extract";
import { EXTRACTION_PROMPT_VERSION } from "@/lib/ai/extraction-schema";
import type { ErrorClass } from "@/lib/domain/events";
import { systemClock, type Clock } from "@/lib/ingestion/pipeline";
import { logEvent } from "@/lib/log";
import type { ExtractionRepository } from "@/lib/store/extraction-types";
import type { EventDraft, SignalRepository, StoredSignal } from "@/lib/store/types";
import { toCaseSignal } from "./signals";

export interface ExtractionDeps {
  signals: SignalRepository;
  extractions: ExtractionRepository;
  ai: AiConfig;
  clock?: Clock;
}

/**
 * `disabled`: AI_PROVIDER=none. `skipped`: the signal is not eligible. `failed`: the result could not be
 * stored (the model may have answered, but nothing is recorded).
 */
export type ExtractionRunStatus = ExtractionStatus | "disabled" | "skipped" | "failed";

export interface ExtractionRunOutcome {
  status: ExtractionRunStatus;
  extractionId: string | null;
  /** Safe reason or failure code. */
  detail: string | null;
}

/** Why a stored signal gets no model call, or null when it is eligible. */
export function extractionIneligibility(s: StoredSignal): string | null {
  if (s.processingStatus === "rejected" || !s.normalized) return "rejected";
  if (s.dedupeStatus === "duplicate") return "duplicate";
  if (s.triageOutcome === "irrelevant") return "irrelevant";
  if (!s.normalized.label.trim() && !s.normalized.excerpt?.trim()) return "no_text";
  return null;
}

const ERROR_CLASS: Record<Exclude<ExtractionStatus, "completed">, ErrorClass> = {
  invalid_output: "validation_error",
  unavailable: "source_unavailable",
  timeout: "timeout",
};

const clip = (s: string, n = 120) => (s.length > n ? s.slice(0, n) : s);

function eventFor(signal: StoredSignal, outcome: ExtractionOutcome, at: Date): EventDraft {
  const completed = outcome.status === "completed";
  const metadata: EventDraft["metadata"] = {
    actor: "system",
    provider: outcome.provider,
    model: clip(outcome.model),
    promptVersion: outcome.promptVersion,
    fields: outcome.fields.length,
    rejected: outcome.rejected.length,
    disagreements: outcome.comparison.filter((c) => c.result === "differs").length,
    attempts: outcome.attempts,
  };
  if (outcome.inputTokens !== null) metadata.inputTokens = outcome.inputTokens;
  if (outcome.outputTokens !== null) metadata.outputTokens = outcome.outputTokens;
  if (outcome.failure) metadata.failure = clip(outcome.failure, 60);
  return {
    caseId: signal.caseId,
    signalId: signal.id,
    correlationId: signal.correlationId,
    type: completed ? "extraction.completed" : "extraction.failed",
    stage: "extraction",
    status: completed ? "completed" : "failed",
    occurredAt: at.toISOString(),
    durationMs: outcome.latencyMs,
    method: { kind: "model", name: clip(`${outcome.provider}:${outcome.model}`) },
    retryCount: outcome.attempts - 1,
    errorClass: completed ? null : ERROR_CLASS[outcome.status as Exclude<ExtractionStatus, "completed">],
    metadata,
    dataMode: "synthetic",
  };
}

/**
 * Runs `signal-extraction.v1` for one stored signal and records the result and its event. The output is a
 * candidate list for a human: it does not change the signal, its case, claims or calculations.
 */
export async function extractForSignal(tenantId: string, signalId: string, deps: ExtractionDeps): Promise<ExtractionRunOutcome> {
  const provider = deps.ai.provider;
  if (!provider) return { status: "disabled", extractionId: null, detail: "AI_PROVIDER=none" };
  const stored = await deps.signals.getSignal(tenantId, signalId);
  if (!stored) return { status: "skipped", extractionId: null, detail: "not_found" };
  const reason = extractionIneligibility(stored);
  const signal = reason ? null : toCaseSignal(stored);
  if (!signal) return { status: "skipped", extractionId: null, detail: reason ?? "not_eligible" };

  const clock = deps.clock ?? systemClock;
  const outcome = await extractSignalFacts(signal, { ...deps.ai, provider }, clock);
  const record = await deps.extractions.record(tenantId, signalId, outcome, eventFor(stored, outcome, clock.now()));
  logEvent(outcome.status === "completed" ? "info" : "warn", `extraction.${outcome.status}`, {
    signalId,
    correlationId: stored.correlationId,
    provider: outcome.provider,
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    attempts: outcome.attempts,
    fields: outcome.fields.length,
    rejected: outcome.rejected.length,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    failure: outcome.failure,
  });
  return { status: outcome.status, extractionId: record.id, detail: outcome.failure };
}

/**
 * Extracts eligible stored signals that have no completed extraction for the current provider, model and
 * prompt version, oldest first. Failed extractions are retried; completed ones are not repeated.
 */
export async function backfillExtractions(
  tenantId: string,
  deps: ExtractionDeps,
  { limit = 200 }: { limit?: number } = {},
): Promise<{ examined: number; byStatus: Record<ExtractionRunStatus, number> }> {
  const byStatus: Record<ExtractionRunStatus, number> = {
    completed: 0, invalid_output: 0, unavailable: 0, timeout: 0, disabled: 0, skipped: 0, failed: 0,
  };
  const provider = deps.ai.provider;
  if (!provider) return { examined: 0, byStatus: { ...byStatus, disabled: 1 } };
  const done = await deps.extractions.completedSignalIds(tenantId, {
    provider: provider.kind, model: provider.model, promptVersion: EXTRACTION_PROMPT_VERSION,
  });
  const records = (await deps.signals.listSignals(tenantId, { limit: 500 }))
    .filter((s) => !done.has(s.id))
    .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id < b.id ? -1 : 1))
    .slice(0, limit);
  for (const s of records) {
    const result = await extractForSignal(tenantId, s.id, deps);
    byStatus[result.status]++;
    // A provider that is down stays down for the rest of this run; stop instead of hammering it.
    if (result.status === "unavailable") break;
  }
  const examined = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { examined, byStatus };
}
