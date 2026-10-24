import { ClaimStateBadge } from "@/components/status/claim-state-badge";
import { ImpactStatusBadge } from "@/components/status/impact-status-badge";
import type { ImpactCalculationResult } from "@/lib/domain";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { EvidenceRef } from "./evidence-ref";

/**
 * Presents a deterministic impact calculation: inputs with their verification state, the formula,
 * the rule version, assumptions, and what would change the result. It only displays the result of
 * `src/lib/impact`; it performs no arithmetic of its own beyond formatting.
 */
export function ImpactCalculationCard({
  impact,
  onOpenEvidence,
}: {
  impact: ImpactCalculationResult;
  onOpenEvidence: (id: string) => void;
}) {
  const unit = impact.unit;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-kpi leading-none tabular-nums" data-testid="impact-result">
              {impact.deficit === null ? "Not calculable" : formatQuantity(impact.deficit, unit)}
            </span>
            <span className="text-sm text-muted-foreground">{impact.deficit === null ? "" : "deficit"}</span>
            <ImpactStatusBadge status={impact.status} />
          </div>
          {impact.status === "provisional" ? (
            <p className="mt-2 max-w-prose text-dense text-muted-foreground">
              <strong className="font-medium text-foreground">Provisional.</strong> This figure uses unverified inputs or explicit
              assumptions. It is not a confirmed shortage.
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Required</dt>
          <dd className="font-mono tabular-nums">{formatQuantity(impact.requiredQuantity, unit)}</dd>
          <dt className="text-muted-foreground">Usable</dt>
          <dd className="font-mono tabular-nums">{formatQuantity(impact.usableQuantity, unit)}</dd>
          <dt className="text-muted-foreground">Rule</dt>
          <dd className="font-mono">{impact.ruleVersion}</dd>
          <dt className="text-muted-foreground">Calculated</dt>
          <dd className="font-mono">{formatDateTime(impact.calculatedAt)}</dd>
        </dl>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Method</h3>
        <p className="rounded-sm border bg-surface-sunken px-3 py-2 font-mono text-xs text-foreground">{impact.method}</p>
        <p className="mt-1 text-xs text-text-tertiary">Calculated by deterministic application code, not by a language model.</p>
      </div>

      <InputsTable inputs={impact.inputs} onOpenEvidence={onOpenEvidence} />

      <div className="grid gap-4 md:grid-cols-2">
        <ListBlock title="Assumptions" empty="No assumptions were needed." items={impact.assumptions} />
        <ListBlock title="What would change this result" empty="Nothing further is required." items={impact.missing} emphasize />
      </div>
      {impact.conflicts.length > 0 ? <ListBlock title="Input conflicts" empty="" items={impact.conflicts} /> : null}
    </div>
  );
}

export function ListBlock({ title, items, empty, emphasize = false }: { title: string; items: string[]; empty: string; emphasize?: boolean }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-dense text-text-tertiary">{empty}</p>
      ) : (
        <ul className={emphasize ? "list-disc space-y-1 pl-4 text-dense marker:text-primary" : "list-disc space-y-1 pl-4 text-dense"}>
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InputsTable({ inputs, onOpenEvidence }: { inputs: ImpactCalculationResult["inputs"]; onOpenEvidence: (id: string) => void }) {
  return (
    <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Inputs</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[30rem] text-dense">
            <caption className="sr-only">Calculation inputs and their verification state</caption>
            <thead className="bg-surface-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Input</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Value</th>
                <th scope="col" className="px-3 py-1.5 font-medium">State</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inputs.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-3 py-2">{i.label}</td>
                  <td className="px-3 py-2">
                    {i.value === null ? (
                      <span className={i.state === "unknown" ? "text-text-tertiary" : "font-mono text-xs"}>{i.note ?? "missing"}</span>
                    ) : (
                      <>
                        <span className="font-mono tabular-nums">{formatQuantity(i.value, i.unit)}</span>
                        {i.note ? <div className="text-xs text-muted-foreground">{i.note}</div> : null}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ClaimStateBadge state={i.state} />
                  </td>
                  <td className="px-3 py-2">
                    {i.evidenceId ? (
                      <EvidenceRef id={i.evidenceId} onOpen={onOpenEvidence} />
                    ) : (
                      <span className="text-xs text-text-tertiary">none retrieved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
}
