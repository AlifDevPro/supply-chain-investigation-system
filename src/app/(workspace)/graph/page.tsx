import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { SupplyGraphView } from "@/components/graph/supply-graph";
import { parseScenario } from "@/lib/data";
import { getGraphData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Supply Chain Graph" };

const DESCRIPTION = "Recorded relationships among suppliers, orders, materials, factories and shipments. Verified links come from foreign keys.";

export default async function GraphPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const result = await settle(getGraphData(parseScenario(search.scenario), search));
  if (!result.ok) {
    return <ExploreFrame title="Supply Chain Graph" description={DESCRIPTION} error={result.error} what="the supply-chain graph" />;
  }
  return (
    <ExploreFrame
      title="Supply Chain Graph"
      description={DESCRIPTION}
      freshness={result.data.freshness}
      what="the supply-chain graph"
      isEmpty={result.data.graph.nodes.length === 0}
      emptyTitle="No relationships in this view"
      emptyBody="Choose another focus, or seed the synthetic business records."
    >
      <SupplyGraphView
        graph={result.data.graph}
        options={result.data.options}
        focus={result.data.focus}
        expanded={result.data.expanded}
        expandable={result.data.expandable}
        truncated={result.data.truncated}
      />
    </ExploreFrame>
  );
}
