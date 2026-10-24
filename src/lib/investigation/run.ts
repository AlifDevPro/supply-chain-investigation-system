import type { ErrorClass, EventType, Stage } from "@/lib/domain/events";
import { systemClock, type Clock } from "@/lib/ingestion/pipeline";
import {
  retrievalSummary,
  type CaseLink,
  type InvestigationRepository,
  type RunTrigger,
  type StoredCase,
  type StoredRun,
} from "@/lib/store/investigation-types";
import type { EventDraft, SignalRepository, StoredSignal } from "@/lib/store/types";
import { UniqueViolationError } from "@/lib/store/types";
import { decideCase, type CaseDecision } from "./case-rules";
import { investigateSignals, RULE_VERSIONS, type InvestigationResult } from "./investigate";
import type { ExtractionDeps } from "./extraction";
import type { BusinessRecordReader } from "./reader";
import { mergeReferences, toCaseSignal, type CaseSignal } from "./signals";
import { syncProposedActions } from "@/lib/actions/propose";
import type { GovernanceRepository } from "@/lib/store/governance-types";

export interface InvestigationDeps {
  signals: SignalRepository;
  investigations: InvestigationRepository;
  reader: BusinessRecordReader;
  clock?: Clock;
  /** AI fact extraction after ingestion. Absent means it is not wired here and is reported as disabled. */
  extraction?: ExtractionDeps;
  governance?: GovernanceRepository;
}

/** Who started the run. `system` for automatic runs; otherwise the signed-in user's display name. */
export type Actor = string;

export type InvestigationStatus = "created" | "updated" | "held" | "skipped" | "failed";

export interface InvestigationOutcome {
  status: InvestigationStatus;
  caseId: string | null;
  runId: string | null;
  /** Why a signal was held or skipped, or the error class of a failure. Safe to show. */
  detail: string | null;
}

/** Linked signals considered per run (newest first). Older ones remain linked and visible. */
export const MAX_SIGNALS_PER_RUN = 10;
const MAX_ATTEMPTS = 3;

class StaleDecisionError extends Error {}
export class InvestigationNotFoundError extends Error {}

const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);
const newestFirst = (a: CaseSignal, b: CaseSignal) =>
  a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : a.id < b.id ? 1 : -1;

/** Connection-level failures are reported as an unavailable source; anything else is internal. */
export function classifyError(error: unknown): ErrorClass {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  if (/^(08|57P0)/.test(code) || /^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_)/.test(code)) {
    return "source_unavailable";
  }
  return "internal_error";
}

async function loadCaseSignals(deps: InvestigationDeps, tenantId: string, ids: readonly string[]): Promise<CaseSignal[]> {
  const loaded = await Promise.all(ids.map((id) => deps.signals.getSignal(tenantId, id)));
  return loaded
    .flatMap((s) => (s ? [toCaseSignal(s)] : []))
    .filter((s): s is CaseSignal => s !== null)
    .sort(newestFirst)
    .slice(0, MAX_SIGNALS_PER_RUN);
}

interface Plan {
  caseId: string;
  existing: StoredCase | null;
  linkedIds: string[];
  runNumber: number;
  signals: CaseSignal[];
}

function eventFactory(tenantId: string, caseId: string | null, signalId: string | null, correlationId: string, actor: Actor) {
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
      caseId,
      signalId,
      correlationId,
      type,
      stage,
      status,
      occurredAt: at.toISOString(),
      durationMs: durationMs === null ? null : Math.max(0, Math.round(durationMs)),
      method: extra.method ?? null,
      retryCount: 0,
      errorClass: extra.errorClass ?? null,
      metadata: { actor, ...(extra.metadata ?? {}) },
      dataMode: "synthetic",
    });
  };
  return { drafts, push, tenantId };
}

function buildRun(tenantId: string, plan: Plan, trigger: RunTrigger, triggerSignalId: string | null, result: InvestigationResult, startedAt: Date, finishedAt: Date): StoredRun {
  const runId = `${plan.caseId}-R${plan.runNumber}`;
  return {
    tenantId,
    id: runId,
    caseId: plan.caseId,
    runNumber: plan.runNumber,
    trigger,
    triggerSignalId,
    ruleVersions: { ...RULE_VERSIONS },
    retrieval: retrievalSummary(result.accounting),
    entities: result.analysis.entities,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    evidence: result.analysis.evidence,
    claims: result.analysis.claims,
    unknowns: result.analysis.unknowns,
    conflicts: result.analysis.conflicts,
    shortage: result.analysis.shortage,
    deliveryRisk: result.analysis.deliveryRisk,
  };
}

function runEvents(
  ev: ReturnType<typeof eventFactory>,
  result: InvestigationResult,
  run: StoredRun,
  stored: StoredCase,
  created: boolean,
  clock: Clock,
) {
  const { analysis, accounting, outcome } = result;
  ev.push("evidence.retrieved", "evidence", "completed", clock.now(), result.retrievalMs, {
    method: { kind: "rule", name: RULE_VERSIONS.investigation },
    metadata: {
      calls: accounting.calls.length,
      rows: accounting.rows,
      truncated: accounting.truncated,
      budgetExhausted: accounting.budgetExhausted,
      evidence: analysis.evidence.length,
      notFound: result.retrieved.purchaseOrder?.found === false || result.retrieved.material?.found === false,
    },
  });
  ev.push("impact.calculated", "impact", analysis.shortage || analysis.deliveryRisk ? "completed" : "skipped", clock.now(), result.analysisMs, {
    method: { kind: "rule", name: `${RULE_VERSIONS.shortage}+${RULE_VERSIONS.deliveryRisk}` },
    metadata: {
      shortageStatus: analysis.shortage?.status ?? "not_calculated",
      ...(analysis.shortage?.deficit !== null && analysis.shortage?.deficit !== undefined
        ? { deficit: analysis.shortage.deficit, unit: analysis.shortage.unit }
        : {}),
      deliveryRiskStatus: analysis.deliveryRisk?.status ?? "not_calculated",
      ...(analysis.deliveryRisk?.delayDays !== null && analysis.deliveryRisk?.delayDays !== undefined
        ? { delayDays: analysis.deliveryRisk.delayDays }
        : {}),
      affectedOrders: analysis.deliveryRisk?.affectedOrders.length ?? 0,
    },
  });
  ev.push(created ? "investigation.created" : "investigation.updated", "case", "completed", clock.now(), null, {
    method: { kind: "rule", name: RULE_VERSIONS.caseRules },
    metadata: {
      runId: run.id,
      runNumber: run.runNumber,
      trigger: run.trigger,
      state: stored.state,
      severity: stored.severity,
      claims: analysis.claims.length,
      conflicts: analysis.conflicts.length,
      unknowns: analysis.unknowns.length,
    },
  });
  if (outcome.requiresReview) {
    ev.push("investigation.needs_review", "review", "waiting", clock.now(), null, {
      method: { kind: "rule", name: RULE_VERSIONS.caseRules },
      metadata: { reason: clip(outcome.reviewReason ?? "review required") },
    });
  }
}

async function recordFailure(
  deps: InvestigationDeps,
  tenantId: string,
  caseId: string | null,
  signal: { id: string | null; correlationId: string },
  actor: Actor,
  errorClass: ErrorClass,
  clock: Clock,
  durationMs: number,
) {
  const ev = eventFactory(tenantId, caseId, signal.id, signal.correlationId, actor);
  ev.push("evidence.retrieved", "evidence", "failed", clock.now(), durationMs, {
    method: { kind: "rule", name: RULE_VERSIONS.investigation },
    errorClass,
    metadata: { stored: true },
  });
  try {
    await deps.investigations.transaction((tx) => tx.insertEvents(tenantId, ev.drafts));
  } catch {
    // The failure event could not be stored either; the caller still reports the failure.
  }
}

/**
 * Runs retrieval and analysis outside any transaction (reads may be slow), then persists the case, link,
 * run and events atomically after re-checking the decision under a per-tenant lock. If the decision went
 * stale in between (a concurrent run created or changed the case), the whole attempt is repeated.
 */
async function persistAttempt(
  deps: InvestigationDeps,
  tenantId: string,
  input: {
    decide: (open: Parameters<typeof decideCase>[1]) => CaseDecision | { action: "rerun"; caseId: string };
    signal: StoredSignal | null;
    trigger: RunTrigger;
    actor: Actor;
    origin: StoredCase["origin"];
  },
  clock: Clock,
): Promise<InvestigationOutcome> {
  const decision = input.decide(await deps.investigations.openCaseReferences(tenantId));
  if (decision.action === "hold" || decision.action === "skip") {
    return { status: decision.action === "hold" ? "held" : "skipped", caseId: null, runId: null, detail: decision.why };
  }

  // ---- Plan (no transaction) ----
  let plan: Plan;
  if (decision.action === "create") {
    const caseId = await deps.investigations.transaction((tx) => tx.nextCaseId());
    plan = { caseId, existing: null, linkedIds: [], runNumber: 1, signals: [] };
  } else {
    const detail = await deps.investigations.getCase(tenantId, decision.caseId);
    if (!detail) throw new InvestigationNotFoundError(decision.caseId);
    plan = {
      caseId: decision.caseId,
      existing: detail.case,
      linkedIds: detail.links.map((l) => l.signalId),
      runNumber: (detail.runs[0]?.runNumber ?? 0) + 1,
      signals: [],
    };
  }
  const ids = [...new Set([...plan.linkedIds, ...(input.signal && decision.action !== "rerun" ? [input.signal.id] : [])])];
  plan.signals = await loadCaseSignals(deps, tenantId, ids);
  const correlation = input.signal ?? (plan.signals[0] ? await deps.signals.getSignal(tenantId, plan.signals[0].id) : null);
  const correlationId = correlation?.correlationId ?? `corr-${plan.caseId}`;

  const startedAt = clock.now();
  const startMs = clock.monotonicMs();
  let result: InvestigationResult;
  try {
    result = await investigateSignals({
      tenantId,
      caseId: plan.caseId,
      runId: `${plan.caseId}-R${plan.runNumber}`,
      signals: plan.signals,
      reader: deps.reader,
      now: startedAt,
      monotonicMs: clock.monotonicMs,
    });
  } catch (error) {
    const errorClass = classifyError(error);
    await recordFailure(deps, tenantId, plan.existing ? plan.caseId : null, { id: input.signal?.id ?? null, correlationId }, input.actor, errorClass, clock, clock.monotonicMs() - startMs);
    return { status: "failed", caseId: plan.existing ? plan.caseId : null, runId: null, detail: errorClass };
  }
  const finishedAt = clock.now();
  const trigger: RunTrigger = decision.action === "attach" && input.trigger === "signal" ? "related_signal" : input.trigger;
  const run = buildRun(tenantId, plan, trigger, input.signal?.id ?? null, result, startedAt, finishedAt);
  const referenceKeys = mergeReferences(plan.signals);
  const stored: StoredCase = {
    tenantId,
    id: plan.caseId,
    ...result.outcome,
    origin: plan.existing?.origin ?? input.origin,
    referenceKeys,
    latestRunId: run.id,
    openedAt: plan.existing?.openedAt ?? startedAt.toISOString(),
    updatedAt: finishedAt.toISOString(),
    dataMode: "synthetic",
  };

  // ---- Persist (one transaction) ----
  await deps.investigations.transaction(async (tx) => {
    await tx.lockCaseDecisions(tenantId);
    const now = input.decide(await tx.openCaseReferences(tenantId));
    const sameDecision =
      now.action === decision.action && ("caseId" in now ? now.caseId : null) === ("caseId" in decision ? decision.caseId : null);
    if (!sameDecision) throw new StaleDecisionError();
    if (input.signal && decision.action !== "rerun" && (await tx.caseIdForSignal(tenantId, input.signal.id))) {
      throw new StaleDecisionError();
    }
    if (plan.existing) {
      const linked = await tx.linkedSignalIds(tenantId, plan.caseId);
      if (linked.length !== plan.linkedIds.length) throw new StaleDecisionError();
      if ((await tx.nextRunNumber(tenantId, plan.caseId)) !== plan.runNumber) throw new StaleDecisionError();
      await tx.updateCase(stored);
    } else {
      await tx.insertCase(stored);
    }
    if (input.signal && decision.action !== "rerun") {
      const link: CaseLink = {
        caseId: plan.caseId,
        signalId: input.signal.id,
        linkReason: decision.reason,
        linkedAt: finishedAt.toISOString(),
      };
      await tx.linkSignal(tenantId, link);
    }
    await tx.insertRun(run);
    const ev = eventFactory(tenantId, plan.caseId, input.signal?.id ?? null, correlationId, input.actor);
    runEvents(ev, result, run, stored, plan.existing === null, clock);
    await tx.insertEvents(tenantId, ev.drafts);
  });
  if (deps.governance) {
    const latest = (await deps.investigations.getCase(tenantId, plan.caseId))?.case ?? stored;
    await syncProposedActions({
      tenantId,
      stored: latest,
      conflicts: result.analysis.conflicts,
      unknowns: result.analysis.unknowns,
      governance: deps.governance,
      updateCase: (c) => deps.investigations.transaction((tx) => tx.updateCase(c)),
      now: finishedAt,
    });
  }
  return { status: plan.existing ? "updated" : "created", caseId: plan.caseId, runId: run.id, detail: null };
}

async function withRetries(fn: () => Promise<InvestigationOutcome>): Promise<InvestigationOutcome> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof StaleDecisionError || error instanceof UniqueViolationError;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}

/**
 * Investigates one stored signal under `case-rules.v1`: creates a case, attaches it to an open case, holds it
 * for an operator, or skips it. The signal itself is already committed; a failure here never removes it.
 * Errors before analysis (e.g. the store is unreachable) propagate; retrieval failures are recorded as a
 * failed `evidence.retrieved` event and reported as `failed`.
 */
export async function investigateSignal(
  tenantId: string,
  signalId: string,
  deps: InvestigationDeps,
  options: { operator?: boolean; trigger?: RunTrigger; actor?: Actor } = {},
): Promise<InvestigationOutcome> {
  const clock = deps.clock ?? systemClock;
  const signal = await deps.signals.getSignal(tenantId, signalId);
  if (!signal) throw new InvestigationNotFoundError(signalId);
  if (signal.caseId) return { status: "skipped", caseId: signal.caseId, runId: null, detail: "already linked to a case" };
  const operator = options.operator ?? false;
  const trigger: RunTrigger = options.trigger ?? (operator ? "operator_open" : "signal");
  const caseSignal = toCaseSignal(signal);
  const references = caseSignal ? mergeReferences([caseSignal]) : {};
  return withRetries(() =>
    persistAttempt(
      deps,
      tenantId,
      {
        decide: (open) =>
          decideCase({ processingStatus: signal.processingStatus, triageOutcome: signal.triageOutcome, references }, open, { operator }),
        signal,
        trigger,
        actor: options.actor ?? "system",
        origin: operator ? "operator" : "automatic",
      },
      clock,
    ),
  );
}

export interface BackfillSummary {
  examined: number;
  byStatus: Record<InvestigationStatus, number>;
}

/**
 * Investigates stored signals that have no case yet, oldest first, so revisions attach to the case their
 * original created. Held (uncertain) signals stay held. Bounded by `limit`.
 */
export async function backfillInvestigations(
  tenantId: string,
  deps: InvestigationDeps,
  options: { limit?: number } = {},
): Promise<BackfillSummary> {
  const signals = (await deps.signals.listSignals(tenantId, { limit: options.limit ?? 500 })).reverse();
  const summary: BackfillSummary = { examined: 0, byStatus: { created: 0, updated: 0, held: 0, skipped: 0, failed: 0 } };
  for (const s of signals) {
    if (s.caseId || s.processingStatus === "rejected" || s.processingStatus === "duplicate") continue;
    summary.examined += 1;
    const outcome = await investigateSignal(tenantId, s.id, deps, { trigger: "backfill" });
    summary.byStatus[outcome.status] += 1;
  }
  return summary;
}

/** Re-runs retrieval and analysis for an existing case with its linked signals. Appends a new run. */
export async function reinvestigateCase(
  tenantId: string,
  caseId: string,
  deps: InvestigationDeps,
  options: { trigger?: RunTrigger; actor?: Actor } = {},
): Promise<InvestigationOutcome> {
  const clock = deps.clock ?? systemClock;
  const existing = await deps.investigations.getCase(tenantId, caseId);
  if (!existing) throw new InvestigationNotFoundError(caseId);
  return withRetries(() =>
    persistAttempt(
      deps,
      tenantId,
      {
        decide: () => ({ action: "rerun", caseId }),
        signal: null,
        trigger: options.trigger ?? "operator_rerun",
        actor: options.actor ?? "system",
        origin: existing.case.origin,
      },
      clock,
    ),
  );
}
