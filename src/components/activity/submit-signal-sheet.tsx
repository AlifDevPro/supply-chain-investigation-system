"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { submitSyntheticSignal } from "@/app/(workspace)/live-activity/actions";
import { IDLE, type SubmitState } from "@/app/(workspace)/live-activity/submit-state";
import { ProcessingStatusBadge } from "@/components/status/processing-status-badge";
import { TriageOutcomeBadge } from "@/components/status/triage-outcome-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EXTRACTION_STATUS_TEXT } from "@/lib/ai/labels";
import { presetText, SIGNAL_PRESETS } from "@/lib/ingestion/presets";

const INVESTIGATION_TEXT: Record<Extract<SubmitState, { kind: "accepted" | "duplicate" }>["investigation"], string> = {
  created: "Case created",
  updated: "Added to open case",
  held: "Held until an operator opens an investigation",
  skipped: "No investigation (duplicate or not relevant)",
  failed: "Investigation failed; the signal is stored. See Live Activity.",
};

const FIELD = "w-full rounded-md border bg-card px-2.5 text-dense text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Result({ state }: { state: SubmitState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-md border border-status-conflicted/50 bg-status-conflicted-bg p-3 text-dense text-status-conflicted">
        {state.message}
      </p>
    );
  }
  if (state.kind === "rejected") {
    return (
      <div role="status" className="space-y-2 rounded-md border border-status-conflicted/50 bg-status-conflicted-bg p-3 text-dense">
        <div className="flex flex-wrap items-center gap-2">
          <ProcessingStatusBadge status="rejected" />
          <span className="font-mono text-xs">{state.signalId}</span>
        </div>
        <p className="text-muted-foreground">The signal was rejected and the rejection was recorded. Submitted values are not stored or shown.</p>
        <ul className="font-mono text-xs">
          {state.issues.map((i, n) => (
            <li key={`${i.path}-${n}`}>
              {i.path || "(body)"}: {i.code}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div role="status" className="space-y-2 rounded-md border bg-surface-sunken p-3 text-dense">
      <div className="flex flex-wrap items-center gap-2">
        <ProcessingStatusBadge status={state.kind === "duplicate" ? "duplicate" : state.requiresReview ? "held_for_review" : "triaged"} />
        {state.triageOutcome ? <TriageOutcomeBadge outcome={state.triageOutcome} /> : null}
        <span className="font-mono text-xs">{state.signalId}</span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <dt>Deduplication</dt>
        <dd className="font-mono">
          {state.dedupeStatus}
          {state.duplicateOf ? ` of ${state.duplicateOf}` : ""}
          {state.revisionOf ? ` of ${state.revisionOf}` : ""}
        </dd>
        {state.reasonCodes.length > 0 ? (
          <>
            <dt>Reasons</dt>
            <dd className="font-mono break-words">{state.reasonCodes.join(", ")}</dd>
          </>
        ) : null}
        <dt>Investigation</dt>
        <dd>
          {INVESTIGATION_TEXT[state.investigation]}
          {state.caseId ? (
            <>
              {" "}
              <Link href={`/investigations/${state.caseId}`} className="font-mono text-foreground underline underline-offset-2">
                {state.caseId}
              </Link>
            </>
          ) : null}
        </dd>
        <dt>AI extraction</dt>
        <dd>{EXTRACTION_STATUS_TEXT[state.extraction]}</dd>
        <dt>Correlation</dt>
        <dd className="font-mono">{state.correlationId}</dd>
      </dl>
    </div>
  );
}

/**
 * Form for submitting one SYNTHETIC signal through the real pipeline. The server decides whether submission is
 * enabled and which tenant is used; `enabled` only controls whether the form is offered.
 */
export function SubmitSignalSheet({ enabled, reason }: { enabled: boolean; reason: string | null }) {
  const [state, action, actionPending] = useActionState(submitSyntheticSignal, IDLE);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const [payload, setPayload] = useState(presetText(SIGNAL_PRESETS[0]!));
  const [presetId, setPresetId] = useState(SIGNAL_PRESETS[0]!.id);
  const preset = SIGNAL_PRESETS.find((p) => p.id === presetId);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={!enabled} aria-describedby={enabled ? undefined : "submit-disabled-reason"}>
          <Send aria-hidden="true" />
          Submit synthetic signal
        </Button>
      </SheetTrigger>
      {!enabled && reason ? (
        <span id="submit-disabled-reason" className="sr-only">
          {reason}
        </span>
      ) : null}
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif text-xl">Submit synthetic signal</SheetTitle>
          <SheetDescription>
            Runs the same validation, deduplication and triage as the API. Synthetic data only. Results appear in Live Activity after the
            page refreshes.
          </SheetDescription>
        </SheetHeader>
        <form
          className="space-y-4 p-4"
          aria-busy={pending}
          onSubmit={(event) => {
            // Submitting through a transition (not the form `action` prop) keeps what the user typed:
            // React 19 resets form fields after a form action completes.
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(() => action(data));
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="signal-preset" className="text-dense font-medium">
              Preset
            </label>
            <select
              id="signal-preset"
              className={`${FIELD} h-9`}
              value={presetId}
              onChange={(e) => {
                const next = SIGNAL_PRESETS.find((p) => p.id === e.target.value);
                if (!next) return;
                setPresetId(next.id);
                setPayload(presetText(next));
              }}
            >
              {SIGNAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {preset ? <p className="text-xs text-muted-foreground">{preset.hint}</p> : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="signal-payload" className="text-dense font-medium">
              Payload (JSON, up to 16 KB)
            </label>
            <textarea
              id="signal-payload"
              name="payload"
              rows={14}
              spellCheck={false}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className={`${FIELD} py-2 font-mono text-xs`}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting..." : "Submit"}
            </Button>
            <p className="text-xs text-muted-foreground">The tenant is set by the server. Timestamps are generated by the server.</p>
          </div>
          <Result state={state} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
