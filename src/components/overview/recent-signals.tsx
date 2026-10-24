"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/states/state-views";
import { ProcessingStatusBadge, RevisionBadge } from "@/components/status/processing-status-badge";
import { TriageOutcomeBadge } from "@/components/status/triage-outcome-badge";
import type { SignalRecord } from "@/lib/domain";
import { formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

type View = "all" | "held";

/**
 * Recent signals with how each was handled. "Held for review" lists signals a human must look at; rejected
 * and duplicate submissions stay visible in "All" so nothing disappears silently.
 */
export function RecentSignals({ signals }: { signals: SignalRecord[] }) {
  const [view, setView] = useState<View>("all");
  if (signals.length === 0) {
    return <EmptyState title="No signals received">No operational signals are recorded in this view.</EmptyState>;
  }
  const held = signals.filter((s) => s.processingStatus === "held_for_review");
  const shown = view === "held" ? held : signals;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter recent signals" className="flex gap-1.5">
        {(
          [
            ["all", `All (${signals.length})`],
            ["held", `Held for review (${held.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={cn(
              "h-7 rounded-sm border px-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              view === key ? "border-primary bg-primary-subtle text-primary-subtle-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-dense text-muted-foreground">No recent signals are held for review.</p>
      ) : (
        <ul className="divide-y">
          {shown.map((s) => (
            <li key={s.id} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
                <time dateTime={s.receivedAt} className="font-mono text-xs text-text-tertiary">
                  {formatDateTime(s.receivedAt)}
                </time>
              </div>
              <p className="text-dense text-foreground">{s.label ?? "Rejected submission (no content stored)"}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{s.sourceType ? humanize(s.sourceType) : "Source unknown"}</span>
                {s.triageOutcome ? <TriageOutcomeBadge outcome={s.triageOutcome} /> : null}
                <ProcessingStatusBadge status={s.processingStatus} />
                <RevisionBadge dedupe={s.dedupeStatus} />
                {s.duplicateOf ? <span className="font-mono">of {s.duplicateOf}</span> : null}
                {s.revisionOf ? <span className="font-mono">revises {s.revisionOf}</span> : null}
                {s.caseId ? (
                  <Link href={`/investigations/${s.caseId}`} className="font-mono text-primary underline-offset-2 hover:underline">
                    {s.caseId}
                  </Link>
                ) : (
                  <span className="text-text-tertiary">No case</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
