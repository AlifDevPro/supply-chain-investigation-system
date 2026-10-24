import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { IntegrationsView } from "@/components/integrations/integrations-view";
import { parseScenario } from "@/lib/data";
import { getIntegrationsData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Integrations" };

const DESCRIPTION = "What this process has observed about its sources. Cards never say connected or healthy.";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const result = await settle(getIntegrationsData(parseScenario((await searchParams).scenario)));
  if (!result.ok) {
    return <ExploreFrame title="Integrations" description={DESCRIPTION} error={result.error} what="integrations" />;
  }
  return (
    <ExploreFrame title="Integrations" description={DESCRIPTION} freshness={result.data.freshness} what="integrations">
      <IntegrationsView data={result.data} />
    </ExploreFrame>
  );
}
