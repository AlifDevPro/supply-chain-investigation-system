import type { EntityKind } from "@/lib/domain";
import type { CatalogSnapshot } from "@/lib/store/catalog-types";

export type GraphFocusKind = "material" | "purchase_order" | "all";

export interface GraphNode {
  id: string;
  kind: EntityKind;
  label: string;
  detail: string;
  recordId: string;
  sourceTable: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relationship: "verified" | "inferred";
  basis: string;
}

export interface SupplyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when a focus hid other catalog nodes. */
  focused: boolean;
}

const nid = (kind: EntityKind, id: string) => `${kind}:${id}`;

/** Verified relationships from stored foreign keys. Inferred edges (signal mentions) are passed in separately. */
export function catalogGraph(
  catalog: CatalogSnapshot,
  inferred: readonly GraphEdge[] = [],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  const add = (node: GraphNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };
  const supplierName = Object.fromEntries(catalog.suppliers.map((s) => [s.id, s.name]));

  for (const s of catalog.suppliers) {
    add({ id: nid("supplier", s.id), kind: "supplier", label: s.name, detail: s.id, recordId: s.id, sourceTable: "suppliers" });
  }
  for (const m of catalog.materials) {
    add({ id: nid("material", m.id), kind: "material", label: m.description, detail: `${m.id} · ${m.variant}`, recordId: m.id, sourceTable: "materials" });
  }
  for (const l of catalog.locations) {
    add({
      id: nid("factory", l.id),
      kind: "factory",
      label: l.name,
      detail: `${l.id} · ${l.kind}`,
      recordId: l.id,
      sourceTable: "locations",
    });
  }
  for (const po of catalog.purchaseOrders) {
    add({
      id: nid("purchase_order", po.id),
      kind: "purchase_order",
      label: po.id,
      detail: `${po.status} · ${supplierName[po.supplierId] ?? po.supplierId}`,
      recordId: po.id,
      sourceTable: "purchase_orders",
    });
  }
  for (const prd of catalog.productionOrders) {
    add({
      id: nid("production_order", prd.id),
      kind: "production_order",
      label: prd.id,
      detail: `${prd.status} · due ${prd.dueDate}`,
      recordId: prd.id,
      sourceTable: "production_orders",
    });
  }
  for (const sh of catalog.shipments) {
    add({
      id: nid("shipment", sh.id),
      kind: "shipment",
      label: sh.id,
      detail: `${sh.status}${sh.eta ? ` · ETA ${sh.eta}` : ""}`,
      recordId: sh.id,
      sourceTable: "shipments",
    });
  }

  const edges: GraphEdge[] = [];
  const push = (from: string, to: string, basis: string, relationship: GraphEdge["relationship"] = "verified") => {
    if (!seen.has(from) || !seen.has(to)) return;
    if (edges.some((e) => e.from === from && e.to === to && e.basis === basis)) return;
    edges.push({ from, to, relationship, basis });
  };

  for (const po of catalog.purchaseOrders) {
    push(nid("supplier", po.supplierId), nid("purchase_order", po.id), "purchase_orders.supplier_id");
  }
  for (const line of catalog.poLines) {
    push(nid("purchase_order", line.purchaseOrderId), nid("material", line.materialId), "purchase_order_lines.material_id");
    push(nid("purchase_order", line.purchaseOrderId), nid("factory", line.destinationLocationId), "purchase_order_lines.destination_location_id");
  }
  for (const prd of catalog.productionOrders) {
    push(nid("production_order", prd.id), nid("factory", prd.locationId), "production_orders.location_id");
  }
  for (const req of catalog.requirements) {
    push(nid("material", req.materialId), nid("production_order", req.productionOrderId), "production_requirements.material_id");
  }
  for (const r of catalog.reservations) {
    push(nid("material", r.materialId), nid("production_order", r.productionOrderId), "inventory_reservations.production_order_id");
  }
  for (const sh of catalog.shipments) {
    push(nid("purchase_order", sh.purchaseOrderId), nid("shipment", sh.id), "shipments.purchase_order_id");
  }
  for (const e of inferred) push(e.from, e.to, e.basis, e.relationship);

  return { nodes, edges };
}

function adjacent(id: string, edges: readonly GraphEdge[]): Set<string> {
  const out = new Set<string>([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}

/**
 * Focused view: the seed node plus one hop. `expanded` node ids each add one further hop.
 * With focus `all`, every catalog node is returned.
 */
export function focusGraph(
  full: { nodes: GraphNode[]; edges: GraphEdge[] },
  focus: { kind: GraphFocusKind; id: string } | null,
  expanded: readonly string[] = [],
): SupplyGraph {
  if (!focus || focus.kind === "all") {
    return { nodes: full.nodes, edges: full.edges, focused: false };
  }
  const seed = nid(focus.kind === "material" ? "material" : "purchase_order", focus.id);
  if (!full.nodes.some((n) => n.id === seed)) {
    return { nodes: [], edges: [], focused: true };
  }
  const keep = adjacent(seed, full.edges);
  for (const extra of expanded) {
    for (const n of adjacent(extra, full.edges)) keep.add(n);
  }
  const nodes = full.nodes.filter((n) => keep.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = full.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges, focused: true };
}

/** Nodes in the current view that still have neighbours outside it. */
export function expandableNodeIds(
  full: { nodes: GraphNode[]; edges: GraphEdge[] },
  current: { nodes: GraphNode[]; edges: GraphEdge[] },
): string[] {
  const shown = new Set(current.nodes.map((n) => n.id));
  return current.nodes
    .filter((n) => [...adjacent(n.id, full.edges)].some((id) => !shown.has(id)))
    .map((n) => n.id);
}

export function graphFocusOptions(catalog: CatalogSnapshot): Array<{ kind: GraphFocusKind; id: string; label: string }> {
  return [
    { kind: "all", id: "all", label: "All recorded relationships" },
    ...catalog.materials.map((m) => ({ kind: "material" as const, id: m.id, label: `Material ${m.id}` })),
    ...catalog.purchaseOrders.map((p) => ({ kind: "purchase_order" as const, id: p.id, label: `Purchase order ${p.id}` })),
  ];
}
