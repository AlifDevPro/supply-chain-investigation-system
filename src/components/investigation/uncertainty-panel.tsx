import { CircleQuestionMark, Split } from "lucide-react";
import type { Conflict, UnknownItem } from "@/lib/domain";
import { EvidenceRef } from "./evidence-ref";

/**
 * Conflicting sources and unknown facts. "None recorded" describes this case's records only; it does
 * not claim that no conflict or unknown exists in the underlying systems.
 */
export function UncertaintyPanel({
  conflicts,
  unknowns,
  onOpenEvidence,
}: {
  conflicts: Conflict[];
  unknowns: UnknownItem[];
  onOpenEvidence: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="conflicts-h" className="space-y-2">
        <h3 id="conflicts-h" className="flex items-center gap-1.5 text-sm font-semibold">
          <Split aria-hidden="true" className="size-4 text-status-conflicted" />
          Conflicting sources <span className="font-mono text-dense font-normal text-muted-foreground">{conflicts.length}</span>
        </h3>
        {conflicts.length === 0 ? (
          <p className="text-dense text-muted-foreground">No conflicts are recorded for this case.</p>
        ) : (
          conflicts.map((c) => (
            <div key={c.id} className="rounded-md border-2 border-status-conflicted/40 bg-status-conflicted-bg/40 p-3">
              <p className="text-dense font-medium">{c.description}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {c.sides.map((s) => (
                  <li key={s.evidenceId} className="rounded-sm border bg-card p-2.5 text-dense">
                    <div className="text-xs font-medium text-muted-foreground">{s.sourceLabel}</div>
                    <div className="mt-0.5 text-foreground">{s.reportedValue}</div>
                    <div className="mt-1">
                      <EvidenceRef id={s.evidenceId} onOpen={onOpenEvidence} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="unknowns-h" className="space-y-2">
        <h3 id="unknowns-h" className="flex items-center gap-1.5 text-sm font-semibold">
          <CircleQuestionMark aria-hidden="true" className="size-4 text-status-unknown" />
          Still unknown <span className="font-mono text-dense font-normal text-muted-foreground">{unknowns.length}</span>
        </h3>
        {unknowns.length === 0 ? (
          <p className="text-dense text-muted-foreground">No unknowns are recorded for this case.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {unknowns.map((u) => (
              <li key={u.id} className="space-y-1 p-3 text-dense">
                <p className="font-medium text-foreground">{u.description}</p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Why it matters: </span>
                  {u.whyItMatters}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">To find out: </span>
                  {u.suggestedRetrieval}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
