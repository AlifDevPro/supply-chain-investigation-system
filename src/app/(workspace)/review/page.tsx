import type { Metadata } from "next";
import { ExploreFrame } from "@/components/common/explore-frame";
import { ReviewQueueTable } from "@/components/review/review-queue-table";
import { getOperatorAvailability, parseScenario } from "@/lib/data";
import { getReviewQueueData } from "@/lib/data/pages";
import { settle } from "@/lib/data/settle";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Review Queue" };

const DESCRIPTION = "Held signals without a case, and cases waiting for a human decision. Review decisions are recorded against the signed-in role.";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(getReviewQueueData(scenario));
  if (!result.ok) {
    return <ExploreFrame title="Review Queue" description={DESCRIPTION} error={result.error} what="the review queue" />;
  }
  return (
    <ExploreFrame
      title="Review Queue"
      description={DESCRIPTION}
      freshness={result.data.freshness}
      what="the review queue"
      isEmpty={result.data.items.length === 0}
      emptyTitle="Nothing waiting for review"
      emptyBody="No held signal without a case, and no case in needs_review or awaiting_approval."
    >
      <ReviewQueueTable
        items={result.data.items}
        operator={getOperatorAvailability()}
        role={(await requireSession()).role}
        persisted={result.data.persisted}
      />
    </ExploreFrame>
  );
}
