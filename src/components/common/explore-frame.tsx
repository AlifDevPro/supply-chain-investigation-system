import { PageHeader } from "@/components/common/page-header";
import { DemoDataNotice } from "@/components/provenance/data-mode-badge";
import { FreshnessIndicator } from "@/components/provenance/freshness-indicator";
import { DataErrorView } from "@/components/states/data-error-view";
import { EmptyState, StaleDataBanner } from "@/components/states/state-views";
import type { Freshness } from "@/lib/data";

/** Shared chrome for the read-only explore and govern pages. */
export function ExploreFrame({
  title,
  description,
  freshness,
  error,
  what,
  emptyTitle,
  emptyBody,
  isEmpty,
  children,
}: {
  title: string;
  description: string;
  freshness?: Freshness;
  error?: unknown;
  what: string;
  emptyTitle?: string;
  emptyBody?: string;
  isEmpty?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        actions={freshness ? <FreshnessIndicator asOf={freshness.asOf} source={freshness.source} stale={freshness.stale} /> : null}
      />
      <DemoDataNotice />
      {freshness?.stale && freshness.note ? <StaleDataBanner>{freshness.note}</StaleDataBanner> : null}
      {error ? <DataErrorView error={error} what={what} /> : isEmpty ? <EmptyState title={emptyTitle ?? "Nothing here"}>{emptyBody}</EmptyState> : children}
    </div>
  );
}
