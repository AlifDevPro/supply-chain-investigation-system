import { ImpactStatusBadge } from "@/components/status/impact-status-badge";
import type { DeliveryRiskResult } from "@/lib/domain";
import { formatDateTime, formatQuantity, humanize } from "@/lib/format";
import { EvidenceRef } from "./evidence-ref";
import { InputsTable, ListBlock } from "./impact-calculation-card";

function days(n: number | null, positive: string, negative: string) {
  if (n === null) return "Not calculable";
  if (n === 0) return "0 days";
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"} ${n > 0 ? positive : negative}`;
}

/**
 * Presents the deterministic delivery-risk result (`delivery-risk.v1`): expected arrival and its basis, delay
 * against the promised date, slack against the earliest requirement and the orders that need the material
 * before it arrives. Display only; every number comes from src/lib/impact/delivery-risk.ts.
 */
export function DeliveryRiskCard({ risk, onOpenEvidence }: { risk: DeliveryRiskResult; onOpenEvidence: (id: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-kpi leading-none tabular-nums" data-testid="delivery-risk-result">
              {days(risk.slackDays, "of slack", "short")}
            </span>
            <ImpactStatusBadge status={risk.status} />
          </div>
          <p className="mt-2 max-w-prose text-dense text-muted-foreground">
            {risk.slackDays === null
              ? "Slack cannot be calculated without an expected arrival and an open requirement."
              : risk.slackDays < 0
                ? "The material is expected after the earliest production requirement."
                : "The material is expected before the earliest production requirement."}
            {risk.status === "provisional" ? " Provisional: it relies on reported or assumed inputs." : ""}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Promised</dt>
          <dd className="font-mono">{risk.promisedDate ?? "unknown"}</dd>
          <dt className="text-muted-foreground">Expected</dt>
          <dd className="font-mono">{risk.expectedArrival ?? "unknown"}</dd>
          <dt className="text-muted-foreground">Basis</dt>
          <dd>{humanize(risk.arrivalBasis)}</dd>
          <dt className="text-muted-foreground">Delay</dt>
          <dd className="font-mono">{days(risk.delayDays, "late", "early")}</dd>
          <dt className="text-muted-foreground">Rule</dt>
          <dd className="font-mono">{risk.ruleVersion}</dd>
          <dt className="text-muted-foreground">Calculated</dt>
          <dd className="font-mono">{formatDateTime(risk.calculatedAt)}</dd>
        </dl>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Orders that need the material before it arrives</h3>
        {risk.affectedOrders.length === 0 ? (
          <p className="text-dense text-text-tertiary">
            {risk.expectedArrival ? "None among the open requirements retrieved." : "Cannot be determined without an expected arrival."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border text-dense">
            {risk.affectedOrders.map((o) => (
              <li key={o.productionOrderId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <span className="font-mono text-xs">{o.productionOrderId}</span>
                <span className="text-xs text-muted-foreground">
                  {formatQuantity(o.quantity, o.unit)} by <span className="font-mono">{o.requiredBy}</span>
                </span>
                {o.evidenceId ? <EvidenceRef id={o.evidenceId} onOpen={onOpenEvidence} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Method</h3>
        <p className="rounded-sm border bg-surface-sunken px-3 py-2 font-mono text-xs text-foreground">{risk.method}</p>
        <p className="mt-1 text-xs text-text-tertiary">Dates are compared as calendar days (UTC) by application code, not by a language model.</p>
      </div>

      <InputsTable inputs={risk.inputs} onOpenEvidence={onOpenEvidence} />

      <div className="grid gap-4 md:grid-cols-2">
        <ListBlock title="Assumptions" empty="No assumptions were needed." items={risk.assumptions} />
        <ListBlock title="What would change this result" empty="Nothing further is required." items={risk.missing} emphasize />
      </div>
      {risk.conflicts.length > 0 ? <ListBlock title="Input conflicts" empty="" items={risk.conflicts} /> : null}
    </div>
  );
}
