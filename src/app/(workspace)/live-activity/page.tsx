import type { Metadata } from "next";
import { EventLog } from "@/components/activity/event-log";
import { PipelineStageRail } from "@/components/activity/pipeline-stage-rail";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { ConnectionStatus } from "@/components/provenance/connection-status";
import { DemoDataNotice } from "@/components/provenance/data-mode-badge";
import { FreshnessIndicator } from "@/components/provenance/freshness-indicator";
import { DataErrorView } from "@/components/states/data-error-view";
import { EmptyState, StaleDataBanner } from "@/components/states/state-views";
import { SubmitSignalSheet } from "@/components/activity/submit-signal-sheet";
import { getActivityData, getOperatorAvailability, getSubmitAvailability, parseScenario } from "@/lib/data";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Live Activity" };

const DESCRIPTION = "The recorded lifecycle of each signal, one event per processing step, with server timestamps and measured durations.";

function loadedAt(iso: string) {
  return `loaded ${new Date(iso).toISOString().slice(11, 16)} UTC`;
}

export default async function LiveActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(getActivityData(scenario));

  if (!result.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Live Activity" description={DESCRIPTION} />
        <DataErrorView error={result.error} what="the event stream" />
      </div>
    );
  }

  const { freshness, events, stages, signals, mode, ai } = result.data;
  const submit = getSubmitAvailability();
  const persisted = mode === "persisted snapshot";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live Activity"
        description={DESCRIPTION}
        actions={
          <>
            <SubmitSignalSheet enabled={submit.enabled} reason={submit.reason} />
            <ConnectionStatus
              state={freshness.stale ? "stale" : persisted ? "snapshot" : "replay"}
              detail={persisted ? loadedAt(freshness.asOf) : undefined}
            />
            <FreshnessIndicator asOf={freshness.asOf} source={freshness.source} stale={freshness.stale} />
          </>
        }
      />
      <DemoDataNotice />
      {persisted ? (
        <p className="text-dense text-muted-foreground">
          These are <strong className="font-medium text-foreground">persisted events</strong> read from the store when the page loaded, not
          a live stream. Reload to see new events. A stage is shown as reached only if an event for it exists.
          {!submit.enabled && submit.reason ? <span className="block">Submission is off: {submit.reason}</span> : null}
        </p>
      ) : (
        <p className="text-dense text-muted-foreground">
          This is a <strong className="font-medium text-foreground">recorded replay</strong> of persisted synthetic events, not a live
          stream. No timers or animations advance it; a stage is shown as reached only if an event for it exists.
          {submit.reason ? <span className="block">Submission is off: {submit.reason}</span> : null}
        </p>
      )}
      {freshness.stale ? <StaleDataBanner>{freshness.note}</StaleDataBanner> : null}

      {events.length === 0 ? (
        <EmptyState title="No events recorded">
          No signal has been processed in this view. When signals arrive, each processing step appears here with its server timestamp.
        </EmptyState>
      ) : (
        <>
          <Panel
            title="Pipeline stages"
            description="Signals and cases whose latest event at each stage has the status shown. Counts are recorded events, not progress."
          >
            <PipelineStageRail summary={stages} />
          </Panel>
          <Panel title="Event log" description="Newest first. Open a trace to see every recorded step for one signal." bodyClassName="p-3">
            <EventLog events={events} signals={signals} operator={persisted ? getOperatorAvailability() : undefined} ai={ai} />
          </Panel>
        </>
      )}
    </div>
  );
}
