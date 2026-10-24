import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { EvidenceExplorer } from "@/components/evidence/evidence-explorer";
import { parseScenario } from "@/lib/data";
import { getEvidenceExplorerData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Evidence Explorer" };

const DESCRIPTION = "Evidence from the latest run of each case. Open a row for provenance. Older runs stay in case history.";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(getEvidenceExplorerData(scenario));
  if (!result.ok) {
    return <ExploreFrame title="Evidence Explorer" description={DESCRIPTION} error={result.error} what="evidence" />;
  }
  return (
    <ExploreFrame
      title="Evidence Explorer"
      description={DESCRIPTION}
      freshness={result.data.freshness}
      what="evidence"
      isEmpty={result.data.evidence.length === 0}
      emptyTitle="No evidence recorded"
      emptyBody="Evidence appears after an investigation run retrieves authorised business records."
    >
      <EvidenceExplorer evidence={result.data.evidence} />
    </ExploreFrame>
  );
}
