import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { InvestigationsTable } from "@/components/investigations/investigations-table";
import { DemoDataNotice } from "@/components/provenance/data-mode-badge";
import { FreshnessIndicator } from "@/components/provenance/freshness-indicator";
import { DataErrorView } from "@/components/states/data-error-view";
import { EmptyState, StaleDataBanner } from "@/components/states/state-views";
import { listInvestigations, parseScenario } from "@/lib/data";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Investigations" };

const DESCRIPTION = "Every case opened from an operational signal, with its verification posture and owner.";

export default async function InvestigationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(listInvestigations(scenario));

  if (!result.ok) {
    return (
      <div className="space-y-5">
        <PageHeader title="Investigations" description={DESCRIPTION} />
        <DataErrorView error={result.error} what="investigations" />
      </div>
    );
  }

  const { freshness, cases } = result.data;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Investigations"
        description={DESCRIPTION}
        actions={<FreshnessIndicator asOf={freshness.asOf} source={freshness.source} stale={freshness.stale} />}
      />
      <DemoDataNotice />
      {freshness.stale ? <StaleDataBanner>{freshness.note}</StaleDataBanner> : null}
      {cases.length === 0 ? (
        <EmptyState title="No investigations yet">
          No signal has produced an investigation in this view. Signals filtered out as irrelevant are still recorded in Live Activity.
        </EmptyState>
      ) : (
        <div className="rounded-md border bg-card p-3">
          <InvestigationsTable cases={cases} pageSize={10} />
        </div>
      )}
    </div>
  );
}
