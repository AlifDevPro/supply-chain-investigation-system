import { CaseStateBadge } from "@/components/status/case-state-badge";
import { ImpactStatusBadge } from "@/components/status/impact-status-badge";
import { SeverityIndicator } from "@/components/status/severity-indicator";
import type { InvestigationCase } from "@/lib/domain";
import { formatDateTime, formatQuantity } from "@/lib/format";

export type SectionLink = { id: string; label: string };

/** Case identity, state, owner, review reason and a provisional-aware impact tile, plus in-page section links. */
export function CaseHeader({
  c,
  sections,
  detailAvailable = true,
}: {
  c: InvestigationCase;
  sections: SectionLink[];
  detailAvailable?: boolean;
}) {
  const deficit = c.shortage?.quantity ?? null;
  return (
    <header className="rounded-md border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-4">
        <div className="min-w-0 flex-1 basis-96 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-mono text-xs font-medium text-primary">{c.id}</span>
            <SeverityIndicator severity={c.severity} />
            <CaseStateBadge state={c.state} />
          </div>
          <h1 className="font-serif text-title font-semibold text-balance text-foreground">{c.title}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{c.summary}</p>
          {c.requiresReview ? (
            <p className="inline-flex max-w-prose items-start gap-2 rounded-sm border border-primary/40 bg-primary-subtle px-2.5 py-1.5 text-dense text-primary-subtle-foreground">
              <strong className="font-semibold">Review required.</strong>
              <span>{c.reviewReason ?? "A person must review this case."}</span>
            </p>
          ) : null}
        </div>

        <div className="w-full shrink-0 space-y-3 sm:w-64">
          <div className="rounded-md border bg-surface-sunken p-3" aria-label="Impact summary" role="group">
            <div className="text-xs font-medium text-muted-foreground">Impact</div>
            <div className="mt-1 font-mono text-kpi leading-none tabular-nums">
              {c.shortage ? (deficit === null ? "Not calculable" : `${formatQuantity(deficit, c.shortage.unit)}`) : c.impactLabel}
            </div>
            {c.shortage ? <div className="mt-0.5 text-xs text-muted-foreground">deficit</div> : null}
            <div className="mt-2">
              <ImpactStatusBadge status={c.impactStatus} />
            </div>
            {c.impactStatus === "provisional" ? (
              <p className="mt-2 text-xs text-muted-foreground">{detailAvailable
                ? "Not a confirmed figure. See what is still unverified below."
                : "Not a confirmed figure. Its inputs are not included in this demo."}</p>
            ) : null}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-dense">
            <dt className="text-muted-foreground">Owner</dt>
            <dd>
              {c.ownerName} <span className="text-muted-foreground">· {c.ownerRole}</span>
            </dd>
            <dt className="text-muted-foreground">Opened</dt>
            <dd className="font-mono text-xs">{formatDateTime(c.openedAt)}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="font-mono text-xs">{formatDateTime(c.updatedAt)}</dd>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-surface-sunken/60 px-4 py-2 text-dense">
        <span className="font-medium">Next:</span>
        <span className="min-w-0 flex-1 basis-64">{c.nextAction}</span>
        {sections.length > 0 ? (
          <nav aria-label="Sections on this page">
            <ul className="flex flex-wrap gap-x-3">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="rounded-sm text-primary underline-offset-2 hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
