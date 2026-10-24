"use client";

import Link from "next/link";
import { EventStatus } from "@/components/status/event-status";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buildTrace, type TraceStep } from "@/lib/derive/trace";
import { ProcessingStatusBadge } from "@/components/status/processing-status-badge";
import { TriageOutcomeBadge } from "@/components/status/triage-outcome-badge";
import { STAGE_LABELS, type InvestigationEvent, type SignalRecord } from "@/lib/domain";
import { formatDateTime, formatDuration, formatTime } from "@/lib/format";
import { AiExtractionPanel } from "@/components/investigation/ai-extraction-panel";
import { OperatorAction, type OperatorAvailability } from "@/components/investigation/operator-action";
import type { AiPanelData } from "@/lib/ai/view";
import { cn } from "@/lib/utils";

function StepView({ step }: { step: TraceStep }) {
  if (step.kind === "missing") {
    return (
      <li className="relative pb-5 pl-7 last:pb-0">
        <span aria-hidden="true" className="absolute top-1 left-0 size-3.5 rounded-full border-2 border-dashed border-border-strong bg-card" />
        <p className="text-dense text-text-tertiary">
          <span className="font-medium">{STAGE_LABELS[step.stage]}</span> · No event recorded
        </p>
      </li>
    );
  }
  return (
    <li className="relative pb-5 pl-7 last:pb-0">
      <span aria-hidden="true" className="absolute top-1 left-0 size-3.5 rounded-full border-2 border-primary bg-primary" />
      {step.gapFromPreviousMs !== null ? (
        <p className="mb-1 font-mono text-xs text-text-tertiary">+{formatDuration(step.gapFromPreviousMs)} after previous stage</p>
      ) : null}
      <p className="text-dense font-medium text-foreground">{STAGE_LABELS[step.stage]}</p>
      <ul className="mt-1 space-y-2">
        {step.events.map((e) => (
          <li key={e.id} className="rounded-sm border bg-surface-sunken px-2.5 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-mono text-foreground">{e.type}</span>
              <EventStatus status={e.status} />
            </div>
            <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-muted-foreground">
              <dt>Server time</dt>
              <dd className="font-mono">
                <time dateTime={e.occurredAt}>{formatTime(e.occurredAt)}</time> UTC
              </dd>
              <dt>Duration</dt>
              <dd className="font-mono">{formatDuration(e.durationMs)}</dd>
              {e.method ? (
                <>
                  <dt>Method</dt>
                  <dd className="font-mono">
                    {e.method.kind}: {e.method.name}
                  </dd>
                </>
              ) : null}
              {e.retryCount > 0 ? (
                <>
                  <dt>Retries</dt>
                  <dd className="font-mono">{e.retryCount}</dd>
                </>
              ) : null}
              {e.errorClass ? (
                <>
                  <dt>Error class</dt>
                  <dd className="font-mono text-status-conflicted">{e.errorClass}</dd>
                </>
              ) : null}
              {Object.entries(e.metadata).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k}</dt>
                  <dd className="font-mono break-words">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Per-signal trace in a side drawer. Steps and gaps come from recorded events only; stages with
 * no event render as a hollow marker labelled "No event recorded".
 */
export function SignalTraceSheet({
  correlationId,
  events,
  signals,
  onClose,
  operator,
  ai = null,
}: {
  correlationId: string | null;
  events: readonly InvestigationEvent[];
  signals: readonly SignalRecord[];
  onClose: () => void;
  /** Persisted modes only: whether "Open investigation" may be offered for a held signal. */
  operator?: OperatorAvailability;
  /** Persisted modes only: AI-extracted candidates per signal. */
  ai?: AiPanelData | null;
}) {
  const trace = correlationId ? buildTrace(correlationId, events) : null;
  const signal = trace ? signals.find((s) => s.correlationId === trace.correlationId) : undefined;
  const caseIds = [...new Set([...(signal?.caseId ? [signal.caseId] : []), ...(trace?.caseIds ?? [])])];
  const canOpen = operator && signal && !signal.caseId && signal.processingStatus === "held_for_review";

  return (
    <Sheet open={correlationId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={cn("w-full max-w-full gap-0 overflow-y-auto sm:max-w-md")}>
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif text-xl">Signal trace</SheetTitle>
          <SheetDescription>
            {signal ? (signal.label ?? "Rejected submission: no content was stored.") : "Recorded events for this flow, in order."}
          </SheetDescription>
        </SheetHeader>
        {trace ? (
          <div className="space-y-4 p-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-dense">
              <dt className="text-muted-foreground">Correlation</dt>
              <dd className="font-mono text-xs">{trace.correlationId}</dd>
              {trace.signalId ? (
                <>
                  <dt className="text-muted-foreground">Signal</dt>
                  <dd className="font-mono text-xs">{trace.signalId}</dd>
                </>
              ) : null}
              {signal ? (
                <>
                  <dt className="text-muted-foreground">Handling</dt>
                  <dd className="flex flex-wrap items-center gap-1.5">
                    <ProcessingStatusBadge status={signal.processingStatus} />
                    {signal.triageOutcome ? <TriageOutcomeBadge outcome={signal.triageOutcome} /> : null}
                  </dd>
                  {signal.duplicateOf ? (
                    <>
                      <dt className="text-muted-foreground">Duplicate of</dt>
                      <dd className="font-mono text-xs">{signal.duplicateOf}</dd>
                    </>
                  ) : null}
                  {signal.revisionOf ? (
                    <>
                      <dt className="text-muted-foreground">Revises</dt>
                      <dd className="font-mono text-xs">{signal.revisionOf}</dd>
                    </>
                  ) : null}
                  {signal.reasonCodes.length > 0 ? (
                    <>
                      <dt className="text-muted-foreground">Reasons</dt>
                      <dd className="font-mono text-xs break-words">{signal.reasonCodes.join(", ")}</dd>
                    </>
                  ) : null}
                  {signal.ruleVersion ? (
                    <>
                      <dt className="text-muted-foreground">Rule version</dt>
                      <dd className="font-mono text-xs">{signal.ruleVersion}</dd>
                    </>
                  ) : null}
                </>
              ) : null}
              {caseIds.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Case</dt>
                  <dd className="flex flex-wrap gap-2">
                    {caseIds.map((c) => (
                      <Link key={c} href={`/investigations/${c}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                        {c}
                      </Link>
                    ))}
                  </dd>
                </>
              ) : null}
              {trace.firstAt ? (
                <>
                  <dt className="text-muted-foreground">First event</dt>
                  <dd className="font-mono text-xs">{formatDateTime(trace.firstAt)}</dd>
                </>
              ) : null}
              {trace.spanMs !== null ? (
                <>
                  <dt className="text-muted-foreground">Elapsed</dt>
                  <dd className="font-mono text-xs">{formatDuration(trace.spanMs)} first to last event</dd>
                </>
              ) : null}
            </dl>
            {canOpen ? (
              <div className="rounded-md border bg-surface-sunken p-3">
                <p className="mb-2 text-dense text-muted-foreground">
                  This signal is held for review and is not part of any case. Opening an investigation runs evidence retrieval and the
                  impact rules for it.
                </p>
                <OperatorAction kind="open" id={signal.id} availability={operator} />
              </div>
            ) : null}
            {ai && signal && signal.processingStatus !== "rejected" ? (
              <AiExtractionPanel signalId={signal.id} extraction={ai.bySignal[signal.id]} configured={ai.configured} />
            ) : null}
            {trace.eventCount === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-dense text-muted-foreground">No events are recorded for this correlation id.</p>
            ) : (
              <ol aria-label="Stages" className="relative ml-1.5 border-l border-border-strong pt-1">
                {trace.steps.map((s) => (
                  <StepView key={s.stage} step={s} />
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
