import { logEvent } from "@/lib/log";
import { processSignal, systemClock, type PipelineDeps, type ProcessOutcome } from "@/lib/ingestion/pipeline";
import { extractForSignal, type ExtractionRunOutcome } from "./extraction";
import { classifyError, investigateSignal, type InvestigationDeps, type InvestigationOutcome } from "./run";

export interface IngestResult {
  outcome: ProcessOutcome;
  /** null for rejected submissions, which never reach investigation. */
  investigation: InvestigationOutcome | null;
  /** null for rejected submissions. AI extraction never changes the signal, its case or calculations. */
  extraction: ExtractionRunOutcome | null;
}

/**
 * Stores a submission (its own transaction), then investigates it in a separate transaction, then runs AI fact
 * extraction in a third. A later step failing never removes what an earlier step stored: an investigation
 * failure is reported as `failed` with a failed event when one can be written; an extraction failure is
 * recorded by the extraction step itself.
 */
export async function ingestAndInvestigate(
  tenantId: string,
  rawText: string,
  deps: PipelineDeps & { investigation: InvestigationDeps },
): Promise<IngestResult> {
  const outcome = await processSignal(tenantId, rawText, deps);
  if (outcome.kind === "rejected") return { outcome, investigation: null, extraction: null };
  if (outcome.kind === "duplicate") {
    return {
      outcome,
      investigation: { status: "skipped", caseId: null, runId: null, detail: "duplicate" },
      extraction: { status: "skipped", extractionId: null, detail: "duplicate" },
    };
  }
  const investigation = await investigate(tenantId, outcome, deps);
  return { outcome, investigation, extraction: await extract(tenantId, outcome, deps.investigation) };
}

async function investigate(
  tenantId: string,
  outcome: Extract<ProcessOutcome, { signalId: string }>,
  deps: PipelineDeps & { investigation: InvestigationDeps },
): Promise<InvestigationOutcome> {
  try {
    return await investigateSignal(tenantId, outcome.signalId, deps.investigation);
  } catch (error) {
    const errorClass = classifyError(error);
    logEvent("error", "investigation.failed", {
      signalId: outcome.signalId,
      correlationId: outcome.correlationId,
      errorClass,
      sqlState: (error as { code?: string } | null)?.code ?? null,
    });
    const clock = deps.investigation.clock ?? systemClock;
    try {
      await deps.investigation.investigations.transaction((tx) =>
        tx.insertEvents(tenantId, [{
          caseId: null,
          signalId: outcome.signalId,
          correlationId: outcome.correlationId,
          type: "evidence.retrieved",
          stage: "evidence",
          status: "failed",
          occurredAt: clock.now().toISOString(),
          durationMs: null,
          method: { kind: "rule", name: "investigation.v1" },
          retryCount: 0,
          errorClass,
          metadata: { actor: "system", stored: true },
          dataMode: "synthetic",
        }]),
      );
    } catch {
      // Store unreachable; the log line above is the only record.
    }
    return { status: "failed", caseId: null, runId: null, detail: errorClass };
  }
}

async function extract(
  tenantId: string,
  outcome: Extract<ProcessOutcome, { signalId: string }>,
  deps: InvestigationDeps,
): Promise<ExtractionRunOutcome> {
  if (!deps.extraction) return { status: "disabled", extractionId: null, detail: "not_configured" };
  try {
    return await extractForSignal(tenantId, outcome.signalId, deps.extraction);
  } catch (error) {
    const errorClass = classifyError(error);
    logEvent("error", "extraction.store_failed", { signalId: outcome.signalId, correlationId: outcome.correlationId, errorClass });
    return { status: "failed", extractionId: null, detail: errorClass };
  }
}
