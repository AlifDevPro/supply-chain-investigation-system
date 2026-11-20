import Link from "next/link";
import { BarList } from "@/components/common/bar-list";
import { MetricCard } from "@/components/common/metric-card";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { WINDOW_LABEL, type ReportMetrics, type ReportWindow } from "@/lib/derive";
import { formatDuration } from "@/lib/format";

function rateText(rate: number | null, when: string): string {
  return rate === null ? "not measured" : `${Math.round(rate * 100)}% ${when}`;
}

export function ReportsView({
  metrics,
  asOf,
  sourceLabel,
}: {
  metrics: ReportMetrics;
  asOf: string;
  sourceLabel: string;
}) {
  const source = sourceLabel;
  const window = metrics.windowLabel;
  return (
    <div className="space-y-5">
      <p className="text-dense text-muted-foreground">{source}</p>
      <div className="flex flex-wrap gap-2" role="navigation" aria-label="Report time window">
        {(Object.keys(WINDOW_LABEL) as ReportWindow[]).map((w) => (
          <Button key={w} asChild size="sm" variant={metrics.window === w ? "default" : "outline"}>
            <Link href={w === "all" ? "/reports" : `/reports?window=${w}`} aria-current={metrics.window === w ? "page" : undefined}>
              {w === "24h" ? "24 hours" : w === "7d" ? "7 days" : "All records"}
            </Link>
          </Button>
        ))}
      </div>

      <section aria-labelledby="operational-title" className="space-y-3">
        <h2 id="operational-title" className="text-base font-semibold">
          Operational events
        </h2>
        <p className="text-dense text-muted-foreground">Counts of stored processing events in this window.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Signals in window"
            value={metrics.signalsInWindow}
            qualifier="Accepted, rejected and duplicate submissions"
            definition={{ formula: "Count of stored signals whose received time is inside the selected window.", source, window }}
            asOf={asOf}
          />
          <MetricCard
            label="Duplicate rate"
            value={rateText(metrics.duplicateRate.rate, "of accepted")}
            qualifier={`${metrics.duplicateRate.numerator} duplicates / ${metrics.duplicateRate.denominator} accepted`}
            definition={{ formula: "Duplicates ÷ accepted signals (rejected submissions are excluded from the denominator).", source, window }}
            asOf={asOf}
          />
          <MetricCard
            label="Held for review"
            value={metrics.heldBacklog.count}
            qualifier={metrics.heldBacklog.oldestAgeHours === null ? "no held signals" : `oldest ${metrics.heldBacklog.oldestAgeHours} h`}
            definition={{ formula: "Current signals whose processing status is held_for_review, regardless of window. Age is hours since received.", source, window: "Current backlog, not a rolling window." }}
            asOf={asOf}
          />
          <MetricCard
            label="Median measured latency"
            value={metrics.measuredLatency.medianMs === null ? "not measured" : formatDuration(metrics.measuredLatency.medianMs)}
            qualifier={`${metrics.measuredLatency.samples} event(s) recorded a duration`}
            definition={{ formula: "Median of event.durationMs where it is not null. Events without a duration are omitted, never treated as 0.", source, window }}
            asOf={asOf}
          />
          <MetricCard
            label="Investigations opened"
            value={metrics.investigationThroughput}
            qualifier="Cases with openedAt in this window"
            definition={{ formula: "Count of cases whose openedAt timestamp falls inside the selected window.", source, window }}
            asOf={asOf}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Volume by source type" description="Signals in this window.">
            <BarList rows={metrics.volumeBySourceType} label="Signals by source type" />
          </Panel>
          <Panel title="Triage mix" description="Signals that have a triage outcome.">
            <BarList rows={metrics.triageMix} label="Triage outcomes" />
          </Panel>
          <Panel title="Event failures by class" description="Failed events in this window.">
            <BarList rows={metrics.failuresByClass} label="Failures by error class" />
          </Panel>
          <Panel title="AI extraction status" description="Stored extractions in this window. Suggestions are not used in calculations.">
            <BarList rows={metrics.extractionStatus} label="Extraction statuses" />
          </Panel>
        </div>
      </section>

      <section aria-labelledby="estimates-title" className="space-y-3">
        <h2 id="estimates-title" className="text-base font-semibold">
          Estimates
        </h2>
        <p className="text-dense text-muted-foreground">
          Figures that mix verified and provisional inputs. They are not confirmed outcomes.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Verified impact"
            value={metrics.impactSplit.verified}
            qualifier={`${metrics.impactSplit.provisional} provisional · ${metrics.impactSplit.incalculable} incalculable · ${metrics.impactSplit.none} none`}
            definition={{ formula: "Count of current cases by impactStatus from shortage.v1 / delivery-risk.v1.", source, window: "Current cases, not a rolling window." }}
            asOf={asOf}
          />
          <MetricCard
            label="Unknowns per case"
            value={metrics.unknowns.average === null ? "not measured" : metrics.unknowns.average.toFixed(1)}
            qualifier={`${metrics.unknowns.total} unknowns across ${metrics.unknowns.cases} case(s)`}
            definition={{ formula: "Sum of unknown items on each case's latest run, divided by the number of cases.", source, window: "Current cases." }}
            asOf={asOf}
          />
          <MetricCard
            label="Conflicts per case"
            value={metrics.conflicts.average === null ? "not measured" : metrics.conflicts.average.toFixed(1)}
            qualifier={`${metrics.conflicts.total} conflicts across ${metrics.conflicts.cases} case(s)`}
            definition={{ formula: "Sum of conflict items on each case's latest run, divided by the number of cases.", source, window: "Current cases." }}
            asOf={asOf}
          />
          <MetricCard
            label="Rules agreement"
            value={rateText(metrics.rulesAgreement.rate, "of compared fields")}
            qualifier={`${metrics.rulesAgreement.numerator} agree / ${metrics.rulesAgreement.denominator} compared`}
            definition={{ formula: "Compared AI-extracted fields whose comparison result is agrees, divided by all compared fields in this window.", source, window }}
            asOf={asOf}
          />
        </div>
        <Panel title="Cases by lifecycle state" description="Current cases.">
          <BarList rows={metrics.casesByState} label="Cases by state" />
        </Panel>
      </section>

      <section aria-labelledby="outcomes-title" className="space-y-2 rounded-md border bg-card p-4">
        <h2 id="outcomes-title" className="text-base font-semibold">
          Verified outcomes
        </h2>
        <p className="text-dense text-muted-foreground">
          {metrics.verifiedOutcomes === 0
            ? "None are recorded. An outcome is counted only after an independent verify-outcome.v1 check and a manager-recorded outcome.verified event. Execution completed is not verification."
            : `${metrics.verifiedOutcomes} outcome.verified event${metrics.verifiedOutcomes === 1 ? "" : "s"} in this window.`}
        </p>
        <p className="text-dense text-muted-foreground">
          Verification rate:{" "}
          {metrics.verificationRate.rate === null
            ? "not measured (no action.execution_completed events in this window)."
            : `${Math.round(metrics.verificationRate.rate * 100)}% (${metrics.verificationRate.numerator} verified ÷ ${metrics.verificationRate.denominator} executions completed).`}
        </p>
      </section>
    </div>
  );
}
