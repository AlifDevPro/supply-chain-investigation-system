import type { Metadata } from "next";
import { AuditView } from "@/components/audit/audit-view";
import { ExploreFrame } from "@/components/common/explore-frame";
import { parseScenario } from "@/lib/data";
import { getAuditPageData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";

export const metadata: Metadata = { title: "Audit & Security" };

const DESCRIPTION = "Append-only events as an audit trail, plus security facts read from the database when one is configured.";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const result = await settle(getAuditPageData(parseScenario((await searchParams).scenario)));
  if (!result.ok) {
    return <ExploreFrame title="Audit & Security" description={DESCRIPTION} error={result.error} what="the audit trail" />;
  }
  return (
    <ExploreFrame
      title="Audit & Security"
      description={DESCRIPTION}
      freshness={result.data.freshness}
      what="the audit trail"
    >
      <AuditView rows={result.data.rows} inspection={result.data.inspection} storeMode={result.data.storeMode} />
    </ExploreFrame>
  );
}
