import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { ReportsView } from "@/components/reports/reports-view";
import { parseScenario } from "@/lib/data";
import { getReportsData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Reports & Analytics" };

const DESCRIPTION = "Counts and rates from stored records. Every figure has a formula, a source and a time window. Nothing is invented.";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const result = await settle(getReportsData(parseScenario(search.scenario), search));
  if (!result.ok) {
    return <ExploreFrame title="Reports & Analytics" description={DESCRIPTION} error={result.error} what="reports" />;
  }
  return (
    <ExploreFrame title="Reports & Analytics" description={DESCRIPTION} freshness={result.data.freshness} what="reports">
      <ReportsView metrics={result.data.metrics} asOf={result.data.freshness.asOf} sourceLabel={result.data.sourceLabel} />
    </ExploreFrame>
  );
}
