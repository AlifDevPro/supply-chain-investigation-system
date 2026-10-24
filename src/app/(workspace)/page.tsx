import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard, type MetricDefinition } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { InvestigationsTable } from "@/components/investigations/investigations-table";
import { AttentionList } from "@/components/overview/attention-list";
import { RecentEvents } from "@/components/overview/recent-events";
import { RecentSignals } from "@/components/overview/recent-signals";
import { StageDistribution } from "@/components/overview/stage-distribution";
import { DemoDataNotice } from "@/components/provenance/data-mode-badge";
import { FreshnessIndicator } from "@/components/provenance/freshness-indicator";
import { DataErrorView } from "@/components/states/data-error-view";
import { EmptyState, StaleDataBanner } from "@/components/states/state-views";
import { getOverviewData, parseScenario } from "@/lib/data";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Overview" };

const FIXTURE_SOURCE = "Synthetic investigation cases (fixture). Not operational data.";
const FIXTURE_SNAPSHOT = "Snapshot of the loaded fixture; no rolling time window.";

function definitions(casesSource: string, fixture: boolean): Record<"active" | "review" | "orders" | "shortages", MetricDefinition> {
  const SOURCE = fixture
    ? FIXTURE_SOURCE
    : `Persisted cases created by case-rules.v1 from ingested signals (${casesSource}). Not operational data.`;
  const SNAPSHOT = fixture ? FIXTURE_SNAPSHOT : "Read from the store when the page loaded; no rolling time window.";
  return {
  active: {
    formula: "Count of cases whose state is not resolved, rejected, dismissed, failed or cancelled.",
    source: SOURCE,
    window: SNAPSHOT,
  },
  review: {
    formula: "Count of active cases in state needs_review or awaiting_approval.",
    source: SOURCE,
    window: SNAPSHOT,
  },
  orders: {
    formula:
      "Sum of affected production orders across active cases with a quantified impact. Split by whether the impact calculation is verified.",
    source: SOURCE,
    window: SNAPSHOT,
  },
  shortages: {
    formula:
      "Count of active cases with a material deficit calculated by the deterministic rule shortage.v1. Split by verified vs provisional.",
    source: SOURCE,
    window: SNAPSHOT,
  },
  };
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(getOverviewData(scenario));

  const header = (fresh?: { asOf: string; source: string; stale: boolean }) => (
    <PageHeader
      title="Overview"
      description="What needs a decision now, what is still unverified, and what is moving through the pipeline."
      actions={fresh ? <FreshnessIndicator asOf={fresh.asOf} source={fresh.source} stale={fresh.stale} /> : null}
    />
  );

  if (!result.ok) {
    return (
      <div className="space-y-5">
        {header()}
        <DataErrorView error={result.error} what="the overview" />
      </div>
    );
  }

  const { freshness, metrics, attention, cases, recentSignals, recentEvents, distribution, sources, casesAsOf } = result.data;
  const fixtureCases = sources.cases === "synthetic fixture";
  const DEFS = definitions(sources.cases, fixtureCases);

  return (
    <div className="space-y-5">
      {header(freshness)}
      <DemoDataNotice />
      {freshness.stale ? <StaleDataBanner>{freshness.note}</StaleDataBanner> : null}

      {cases.length === 0 ? (
        <EmptyState title="No investigations yet">
          No signal has produced an investigation in this view. Signals that are filtered out as irrelevant are still recorded in Live
          Activity.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="attention-title" className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="attention-title" className="text-base font-semibold">
                Needs attention
                <span className="ml-2 font-mono text-dense font-normal text-muted-foreground">{attention.length}</span>
              </h2>
              <p className="text-dense text-muted-foreground">Sorted by severity, then most recent update.</p>
            </div>
            <AttentionList items={attention} />
          </section>

          <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active investigations"
              value={metrics.activeInvestigations}
              qualifier="Open cases, any lifecycle state"
              definition={DEFS.active}
              asOf={casesAsOf}
            />
            <MetricCard
              label="Awaiting review"
              value={metrics.awaitingReview}
              qualifier="Need a human decision"
              definition={DEFS.review}
              asOf={casesAsOf}
              tone={metrics.awaitingReview > 0 ? "attention" : "default"}
            />
            <MetricCard
              label="Orders potentially at risk"
              value={metrics.ordersAtRisk.total}
              qualifier={`${metrics.ordersAtRisk.verified} verified · ${metrics.ordersAtRisk.provisional} provisional`}
              definition={DEFS.orders}
              asOf={casesAsOf}
            />
            <MetricCard
              label="Material shortages under investigation"
              value={metrics.shortages.total}
              qualifier={`${metrics.shortages.verified} verified · ${metrics.shortages.provisional} provisional`}
              definition={DEFS.shortages}
              asOf={casesAsOf}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel
              title="Investigations"
              description={
                fixtureCases
                  ? `Most recently updated first. Source: ${sources.cases}; not produced by ingested signals.`
                  : `Most recently updated first. Source: ${sources.cases}; opened from ingested signals by case-rules.v1.`
              }
              actions={
                <Link href="/investigations" className="text-dense font-medium text-primary underline-offset-2 hover:underline">
                  View all
                </Link>
              }
              bodyClassName="p-3"
            >
              <InvestigationsTable cases={cases} compact pageSize={6} showFilters={false} />
            </Panel>

            <div className="space-y-4">
              <Panel title="Recent signals" description={`As received, with how each was handled. Source: ${sources.signals}.`}>
                <RecentSignals signals={recentSignals} />
              </Panel>
              <Panel title="Stage distribution" description="Cases by lifecycle state.">
                <StageDistribution rows={distribution} />
              </Panel>
            </div>
          </div>

          <Panel
            title="Recent important events"
            description={`Failures, waits for review, and case or action events. Source: ${sources.events}.`}
            actions={
              <Link href="/live-activity" className="text-dense font-medium text-primary underline-offset-2 hover:underline">
                Open Live Activity
              </Link>
            }
          >
            <RecentEvents events={recentEvents} />
          </Panel>
        </>
      )}
    </div>
  );
}
