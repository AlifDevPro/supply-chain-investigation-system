"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { GraphEdge, GraphFocusKind, GraphNode, SupplyGraph } from "@/lib/derive";
import type { EntityKind } from "@/lib/domain";
import { cn } from "@/lib/utils";

const COLUMNS: EntityKind[] = ["supplier", "purchase_order", "material", "production_order", "factory", "shipment"];
const KIND_LABEL: Record<EntityKind, string> = {
  supplier: "Supplier",
  purchase_order: "Purchase order",
  material: "Material",
  production_order: "Production order",
  factory: "Factory / warehouse",
  shipment: "Shipment",
};

function graphHref(focus: { kind: GraphFocusKind; id: string } | null, expanded: readonly string[]): string {
  const params = new URLSearchParams();
  if (focus && focus.kind !== "all") {
    params.set("focus", focus.kind);
    params.set("id", focus.id);
    if (expanded.length > 0) params.set("expand", expanded.join(","));
  }
  const q = params.toString();
  return q ? `/graph?${q}` : "/graph";
}

export function SupplyGraphView({
  graph,
  options,
  focus,
  expanded = [],
  expandable = [],
  truncated,
}: {
  graph: SupplyGraph;
  options: Array<{ kind: GraphFocusKind; id: string; label: string }>;
  focus: { kind: GraphFocusKind; id: string } | null;
  expanded?: string[];
  expandable?: string[];
  truncated: boolean;
}) {
  const [selected, setSelected] = useState<{ node?: GraphNode; edge?: GraphEdge } | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<EntityKind, GraphNode[]>();
    for (const k of COLUMNS) map.set(k, []);
    for (const n of graph.nodes) map.get(n.kind)?.push(n);
    return map;
  }, [graph.nodes]);

  const edgeRows = graph.edges.map((e) => ({
    ...e,
    id: `${e.from}->${e.to}:${e.basis}`,
  }));

  const canExpand = new Set(expandable);

  return (
    <div className="space-y-5">
      {truncated ? (
        <p className="text-dense text-muted-foreground">The catalog was truncated at 500 rows per table. Only the first rows are shown.</p>
      ) : null}
      {graph.focused ? (
        <p className="text-dense text-muted-foreground">
          One hop from the selected record. Use Expand on a node to add its neighbours. Verified links cite a foreign-key column;
          inferred links (from a signal mention only) are labelled inferred.
        </p>
      ) : (
        <p className="text-dense text-muted-foreground">
          Verified links cite a foreign-key column. Inferred links (from a signal mention only) are labelled inferred.
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="navigation" aria-label="Graph focus">
        {options.map((o) => {
          const href = o.kind === "all" ? "/graph" : `/graph?focus=${o.kind}&id=${encodeURIComponent(o.id)}`;
          const active = (focus?.kind ?? "all") === o.kind && (o.kind === "all" || focus?.id === o.id);
          return (
            <Button key={`${o.kind}-${o.id}`} asChild size="sm" variant={active ? "default" : "outline"}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                {o.label}
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card p-3">
        <div className="grid min-w-[56rem] grid-cols-6 gap-3">
          {COLUMNS.map((kind) => (
            <div key={kind} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{KIND_LABEL[kind]}</h3>
              <ul className="space-y-1.5">
                {(grouped.get(kind) ?? []).map((n) => (
                  <li key={n.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelected({ node: n })}
                      className={cn(
                        "min-h-10 w-full rounded-sm border bg-surface-sunken px-2 py-1.5 text-left text-xs hover:bg-primary-subtle focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <div className="font-medium text-foreground">{n.label}</div>
                      <div className="font-mono text-[11px] text-text-tertiary">{n.detail}</div>
                    </button>
                    {canExpand.has(n.id) ? (
                      <Button asChild size="sm" variant="outline" className="h-8 w-full text-xs">
                        <Link href={graphHref(focus, [...expanded, n.id])}>Expand one hop</Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
                {(grouped.get(kind) ?? []).length === 0 ? (
                  <li className="text-xs text-text-tertiary">none in this view</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <DataTable
        data={edgeRows}
        caption="Relationships in this view"
        getRowId={(e) => e.id}
        pageSize={8}
        columns={[
          { id: "from", header: "From", accessorFn: (e) => e.from, cell: ({ row }) => <span className="font-mono text-xs">{row.original.from}</span> },
          { id: "to", header: "To", accessorFn: (e) => e.to, cell: ({ row }) => <span className="font-mono text-xs">{row.original.to}</span> },
          {
            id: "rel",
            header: "Link",
            accessorFn: (e) => e.relationship,
            cell: ({ row }) => (
              <span className={cn("text-dense", row.original.relationship === "inferred" && "italic")}>
                {row.original.relationship === "verified" ? "Verified" : "Inferred (dashed)"}
              </span>
            ),
          },
          {
            id: "basis",
            header: "Basis",
            accessorFn: (e) => e.basis,
            cell: ({ row }) => (
              <button type="button" className="font-mono text-xs text-primary underline-offset-2 hover:underline" onClick={() => setSelected({ edge: row.original })}>
                {row.original.basis}
              </button>
            ),
          },
        ]}
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full max-w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="font-serif text-xl">{selected?.node?.label ?? selected?.edge?.basis ?? "Source"}</SheetTitle>
            <SheetDescription>Source record behind this node or relationship. Synthetic demo data.</SheetDescription>
          </SheetHeader>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 text-dense">
            {selected?.node ? (
              <>
                <dt className="text-muted-foreground">Kind</dt>
                <dd>{KIND_LABEL[selected.node.kind]}</dd>
                <dt className="text-muted-foreground">Record</dt>
                <dd className="font-mono text-xs">{selected.node.recordId}</dd>
                <dt className="text-muted-foreground">Table</dt>
                <dd className="font-mono text-xs">{selected.node.sourceTable}</dd>
                <dt className="text-muted-foreground">Detail</dt>
                <dd>{selected.node.detail}</dd>
                <dt className="text-muted-foreground">Drill-down</dt>
                <dd className="space-y-1">
                  <div>
                    <Link
                      href={`/investigations?ref=${encodeURIComponent(selected.node.recordId)}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Investigations mentioning {selected.node.recordId}
                    </Link>
                  </div>
                  <div>
                    <Link
                      href={`/evidence?q=${encodeURIComponent(selected.node.recordId)}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Evidence for {selected.node.recordId}
                    </Link>
                  </div>
                </dd>
              </>
            ) : null}
            {selected?.edge ? (
              <>
                <dt className="text-muted-foreground">From</dt>
                <dd className="font-mono text-xs">{selected.edge.from}</dd>
                <dt className="text-muted-foreground">To</dt>
                <dd className="font-mono text-xs">{selected.edge.to}</dd>
                <dt className="text-muted-foreground">Relationship</dt>
                <dd>{selected.edge.relationship}</dd>
                <dt className="text-muted-foreground">Basis</dt>
                <dd className="font-mono text-xs">{selected.edge.basis}</dd>
                <dt className="text-muted-foreground">Drill-down</dt>
                <dd className="space-y-1">
                  {[selected.edge.from, selected.edge.to].map((endpoint) => {
                    const recordId = endpoint.includes(":") ? endpoint.slice(endpoint.indexOf(":") + 1) : endpoint;
                    return (
                      <div key={endpoint}>
                        <Link
                          href={`/investigations?ref=${encodeURIComponent(recordId)}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Investigations mentioning {recordId}
                        </Link>
                      </div>
                    );
                  })}
                </dd>
              </>
            ) : null}
          </dl>
        </SheetContent>
      </Sheet>
    </div>
  );
}
