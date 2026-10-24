import type { EntityEdge, EntityNode } from "@/lib/domain";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EvidenceRef } from "./evidence-ref";

/**
 * Supplier -> purchase order -> material -> production order -> factory -> shipment, as a vertical chain.
 * Verified links are solid and labelled; inferred links are dashed and labelled. The basis for each
 * link is shown, and each node links to the evidence behind it. This is not a graph database view.
 */
export function EntityChain({
  nodes,
  edges,
  onOpenEvidence,
}: {
  nodes: EntityNode[];
  edges: EntityEdge[];
  onOpenEvidence: (id: string) => void;
}) {
  return (
    <ol aria-label="Entity chain" className="space-y-0">
      {nodes.map((n, i) => {
        const next = nodes[i + 1];
        const edge = next ? edges.find((e) => e.from === n.id && e.to === next.id) : undefined;
        return (
          <li key={n.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{humanize(n.kind)}</div>
                <div className="text-dense font-medium text-foreground">{n.label}</div>
                <div className="text-xs text-muted-foreground">{n.detail}</div>
              </div>
              {n.evidenceId ? <EvidenceRef id={n.evidenceId} onOpen={onOpenEvidence} /> : null}
            </div>
            {next ? (
              <div className="flex items-stretch gap-3 pl-6">
                <span
                  aria-hidden="true"
                  className={cn("my-0.5 w-0 border-l-2", edge?.relationship === "inferred" ? "border-dashed border-status-inferred" : "border-solid border-status-verified")}
                />
                <p className="py-1.5 text-xs text-muted-foreground">
                  {edge ? (
                    <>
                      <strong className="font-semibold text-foreground">{edge.relationship === "verified" ? "Verified link" : "Inferred link"}</strong>
                      {" · "}
                      {edge.basis}
                    </>
                  ) : (
                    <strong className="font-semibold text-foreground">Relationship not recorded</strong>
                  )}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
