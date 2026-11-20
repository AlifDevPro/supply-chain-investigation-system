import type { Metadata } from "next";
import Link from "next/link";
import { ExploreFrame } from "@/components/common/explore-frame";
import { EvidenceExplorer } from "@/components/evidence/evidence-explorer";
import { parseScenario } from "@/lib/data";
import { getEvidenceExplorerData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Evidence Explorer" };

const DESCRIPTION = "Evidence from the latest run of each case. Open a row for provenance. Older runs stay in case history.";

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const scenario = parseScenario(search.scenario);
  const result = await settle(getEvidenceExplorerData(scenario, search));
  if (!result.ok) {
    return <ExploreFrame title="Evidence Explorer" description={DESCRIPTION} error={result.error} what="evidence" />;
  }
  const { evidence, query, freshness } = result.data;
  return (
    <ExploreFrame
      title="Evidence Explorer"
      description={DESCRIPTION}
      freshness={freshness}
      what="evidence"
      isEmpty={evidence.length === 0}
      emptyTitle={query ? "No matching evidence" : "No evidence recorded"}
      emptyBody={
        query
          ? `No evidence row matches “${query}”. Clear the filter or pick another record from the graph.`
          : "Evidence appears after an investigation run retrieves authorised business records."
      }
    >
      {query ? (
        <p className="mb-3 text-dense text-muted-foreground">
          Filtered by <span className="font-mono text-xs">{query}</span>.{" "}
          <Link href="/evidence" className="text-primary underline-offset-2 hover:underline">
            Clear filter
          </Link>
        </p>
      ) : null}
      <EvidenceExplorer evidence={evidence} />
    </ExploreFrame>
  );
}