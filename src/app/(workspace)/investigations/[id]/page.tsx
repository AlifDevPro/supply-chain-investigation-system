import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseWorkspace } from "@/components/investigation/case-workspace";
import { PageHeader } from "@/components/common/page-header";
import { DemoDataNotice } from "@/components/provenance/data-mode-badge";
import { FreshnessIndicator } from "@/components/provenance/freshness-indicator";
import { DataErrorView } from "@/components/states/data-error-view";
import { StaleDataBanner } from "@/components/states/state-views";
import { NotFoundError, getInvestigationDetail, getOperatorAvailability, parseScenario } from "@/lib/data";
import { settle } from "@/lib/data/settle";
import { requireSession } from "@/lib/auth/session";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
}

export default async function InvestigationPage({ params, searchParams }: Props) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const scenario = parseScenario((await searchParams).scenario);
  const result = await settle(getInvestigationDetail(id, scenario));

  if (!result.ok) {
    if (result.error instanceof NotFoundError) notFound();
    return (
      <div className="space-y-5">
        <PageHeader title={id} description="Investigation" />
        <DataErrorView error={result.error} what="this investigation" />
      </div>
    );
  }

  const { freshness, detail, ai, actionDigests } = result.data;
  const session = await requireSession();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DemoDataNotice className="flex-1 basis-80" />
        <FreshnessIndicator asOf={freshness.asOf} source={freshness.source} stale={freshness.stale} />
      </div>
      {freshness.stale ? <StaleDataBanner>{freshness.note}</StaleDataBanner> : null}
      <CaseWorkspace
        detail={detail}
        operator={detail.runs !== undefined ? getOperatorAvailability() : undefined}
        ai={ai}
        actionControls={{ persisted: detail.runs !== undefined, role: session.role, digests: actionDigests }}
      />
    </div>
  );
}
