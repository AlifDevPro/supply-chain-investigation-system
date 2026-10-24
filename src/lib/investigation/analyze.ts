import type {
  Claim,
  ClaimState,
  Conflict,
  DeliveryRiskResult,
  EntityEdge,
  EntityNode,
  EvidenceItem,
  ImpactCalculationResult,
  UnknownItem,
  Unit,
} from "@/lib/domain";
import { convertQuantity, calculateProvisionalShortage, roundQuantity, type QuantityInput } from "@/lib/impact/shortage";
import { calculateDeliveryRisk, type RequirementInput } from "@/lib/impact/delivery-risk";
import { addDays, daysBetween } from "@/lib/impact/dates";
import type { InventoryBalanceRecord, RecordMeta, RequirementRecord } from "./records";
import type { Retrieved } from "./retrieve";
import { extractReportedDelayDays, type CaseSignal } from "./signals";

export const INVESTIGATION_RULE_VERSION = "investigation.v1";

/** Inventory counted longer ago than this is shown as `stale`, not `verified`. */
export const INVENTORY_STALE_AFTER_HOURS = 24;

/** Without an expected arrival date, requirements due within this many days are used for the shortage. */
export const SHORTAGE_HORIZON_DAYS = 14;

const SOURCE_SYSTEM = "Synthetic ERP (Supabase)";
const MAX_SIGNAL_EVIDENCE = 5;
const MAX_REQUIREMENT_CLAIMS = 5;

export interface AnalysisInput {
  runId: string;
  caseId: string;
  /** Newest first. */
  signals: readonly CaseSignal[];
  retrieved: Retrieved;
  now: Date;
}

export interface Analysis {
  evidence: EvidenceItem[];
  claims: Claim[];
  unknowns: UnknownItem[];
  conflicts: Conflict[];
  shortage: ImpactCalculationResult | null;
  deliveryRisk: DeliveryRiskResult | null;
  entities: { nodes: EntityNode[]; edges: EntityEdge[] };
  reportedDelayDays: number | null;
}

const fmt = (n: number) => roundQuantity(n).toLocaleString("en-US");
const clip = (s: string, max = 600) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/**
 * Rules `investigation.v1`: turns retrieved records and signals into evidence, claims, conflicts and unknowns,
 * then runs the deterministic impact calculations. Pure: same input, same output. No AI, no free text is
 * interpreted as an instruction, and "not found" is always reported as "not found in the searched scope".
 */
export function analyzeCase(input: AnalysisInput): Analysis {
  const { runId, caseId, signals, retrieved: r, now } = input;
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const evidence: EvidenceItem[] = [];
  const claims: Claim[] = [];
  const unknowns: UnknownItem[] = [];
  const conflicts: Conflict[] = [];
  const dateConflicts: string[] = [];

  const addEvidence = (e: Omit<EvidenceItem, "id" | "caseId" | "dataMode" | "observedAt"> & { observedAt?: string }): string => {
    const id = `${runId}-E${evidence.length + 1}`;
    evidence.push({ ...e, id, caseId, observedAt: e.observedAt ?? nowIso, excerpt: clip(e.excerpt), dataMode: "synthetic" });
    return id;
  };
  const addClaim = (statement: string, state: ClaimState, basis: string, evidenceIds: string[]) => {
    claims.push({ id: `${runId}-C${claims.length + 1}`, caseId, statement, state, basis, evidenceIds, dataMode: "synthetic" });
  };
  const addUnknown = (description: string, whyItMatters: string, suggestedRetrieval: string) => {
    unknowns.push({ id: `${runId}-U${unknowns.length + 1}`, caseId, description, whyItMatters, suggestedRetrieval, dataMode: "synthetic" });
  };
  const addConflict = (description: string, sides: Conflict["sides"]) => {
    // Every side must point at real evidence; a side without one is never given a made-up reference.
    const grounded = sides.filter((s) => s.evidenceId !== "");
    if (grounded.length < 2) {
      addUnknown(description, "The disagreement could not be tied to evidence on both sides.", "Retrieve the records on both sides.");
      return;
    }
    conflicts.push({ id: `${runId}-X${conflicts.length + 1}`, caseId, description, sides: grounded, dataMode: "synthetic" });
  };
  const recordEvidence = (
    meta: RecordMeta,
    sourceType: EvidenceItem["sourceType"],
    title: string,
    excerpt: string,
    fieldLocation: string,
    status: ClaimState = "verified",
  ) =>
    addEvidence({
      sourceSystem: SOURCE_SYSTEM,
      sourceType,
      sourceTable: meta.sourceTable,
      sourceRecordId: meta.recordId,
      title,
      excerpt,
      fieldLocation,
      sourceReportedAt: meta.updatedAt,
      recordVersion: `v${meta.recordVersion}`,
      extractionMethod: "system_record",
      verificationStatus: status,
    });

  // ---- Signals: what sources reported ------------------------------------------------------------------
  const signalEvidence = new Map<string, string>();
  for (const s of signals.slice(0, MAX_SIGNAL_EVIDENCE)) {
    const n = s.normalized;
    const id = addEvidence({
      sourceSystem: s.sourceSystem,
      sourceType: s.sourceType,
      sourceTable: "signals",
      sourceRecordId: s.sourceRecordId ?? s.id,
      title: `Signal ${s.id}: ${n.label}`,
      excerpt: n.excerpt ?? n.label,
      fieldLocation: n.excerpt ? "excerpt" : "label",
      observedAt: s.receivedAt,
      sourceReportedAt: n.sourceReportedAt,
      recordVersion: s.id,
      extractionMethod: "deterministic_rule",
      verificationStatus: "reported",
    });
    signalEvidence.set(s.id, id);
    addClaim(`${s.sourceSystem} reported: "${n.label}"`, "reported", "Stated by the source. A report is not proof that the event occurred.", [id]);
  }
  if (signals.length > MAX_SIGNAL_EVIDENCE) {
    addUnknown(
      `${signals.length - MAX_SIGNAL_EVIDENCE} older linked signal(s) were not analysed in this run`,
      "Older reports could contain different figures.",
      "Open the linked signals in Live Activity.",
    );
  }

  const latest = signals[0];
  const latestEvidence = latest ? (signalEvidence.get(latest.id) ?? null) : null;

  // ---- Reported delay length ---------------------------------------------------------------------------
  const delays = signals
    .map((s) => ({ s, days: extractReportedDelayDays(s) }))
    .filter((d): d is { s: CaseSignal; days: number } => d.days !== null);
  const reportedDelay = delays[0] ?? null;
  if (reportedDelay) {
    addClaim(
      `Reported delay: ${reportedDelay.days} day(s)`,
      "reported",
      `Delay length stated in signal ${reportedDelay.s.id} (rule delay-length.v1).`,
      [signalEvidence.get(reportedDelay.s.id) ?? ""].filter(Boolean),
    );
    const distinct = new Map(delays.map((d) => [d.days, d]));
    if (distinct.size > 1) {
      const text = `Linked signals state different delay lengths (${[...distinct.keys()].join(" vs ")} days).`;
      dateConflicts.push(text);
      addConflict(
        text,
        [...distinct.values()].slice(0, 4).map((d) => ({
          evidenceId: signalEvidence.get(d.s.id) ?? "",
          sourceLabel: `Signal ${d.s.id}`,
          reportedValue: `${d.days} days`,
        })),
      );
    }
  }

  // ---- Purchase order ----------------------------------------------------------------------------------
  let promisedEvidence: string | null = null;
  const po = r.purchaseOrder;
  if (po && !po.found) {
    addUnknown(
      `Purchase order ${po.key} was not found in the synthetic ERP records searched for this tenant`,
      "Without the order line, the promised date and ordered quantity cannot be confirmed.",
      `Confirm the purchase-order number ${po.key} with procurement.`,
    );
  } else if (po?.record) {
    const rec = po.record;
    const line = r.line;
    if (line) {
      promisedEvidence = recordEvidence(
        line.meta,
        "erp_purchase_order",
        `${rec.id} line ${line.lineNo} (${rec.supplierName})`,
        `${fmt(line.quantity)} ${line.unit} of ${line.materialId}, promised ${line.promisedDate}, to ${line.destinationLocationId}. Order status: ${rec.status}.`,
        "purchase_order_lines.quantity, unit, promised_date, destination_location_id",
      );
      addClaim(
        `${rec.id} (${rec.supplierName}) orders ${fmt(line.quantity)} ${line.unit} of ${line.materialId}, promised ${line.promisedDate}`,
        "verified",
        "Read from the purchase-order line in the system of record.",
        [promisedEvidence],
      );
      if ((rec.status === "received" || rec.status === "cancelled") && reportedDelay) {
        addConflict(`A delay is reported but ${rec.id} is recorded as ${rec.status}.`, [
          { evidenceId: signalEvidence.get(reportedDelay.s.id) ?? "", sourceLabel: `Signal ${reportedDelay.s.id}`, reportedValue: `Delayed ${reportedDelay.days} days` },
          { evidenceId: promisedEvidence, sourceLabel: `${rec.id} status`, reportedValue: rec.status },
        ]);
      }
    } else {
      const lines = rec.lines.map((l) => `${l.materialId} (line ${l.lineNo})`).join(", ") || "no lines";
      const poEvidence = recordEvidence(rec.meta, "erp_purchase_order", `${rec.id} (${rec.supplierName})`, `Lines: ${lines}. Status: ${rec.status}.`, "purchase_order_lines.material_id");
      if (r.references.material) {
        addConflict(`The signal names material ${r.references.material}, but ${rec.id} has no line for it.`, [
          { evidenceId: latestEvidence ?? "", sourceLabel: "Signal reference", reportedValue: r.references.material },
          { evidenceId: poEvidence, sourceLabel: `${rec.id} lines`, reportedValue: lines },
        ]);
      } else {
        addUnknown(
          `Which line of ${rec.id} is affected`,
          "The order has several lines and the signal does not name a material.",
          `Ask the supplier which material on ${rec.id} is delayed.`,
        );
      }
    }

    // Reported quantity vs ordered quantity.
    const q = latest?.normalized.quantity ?? null;
    if (line && q && latest) {
      const converted = convertQuantity(q.value, q.unit, line.unit);
      const sigEv = latestEvidence ?? "";
      if (converted === null) {
        addConflict(`The reported quantity is in ${q.unit}, which cannot be converted to the order unit ${line.unit}.`, [
          { evidenceId: sigEv, sourceLabel: `Signal ${latest.id}`, reportedValue: `${fmt(q.value)} ${q.unit}` },
          { evidenceId: promisedEvidence ?? "", sourceLabel: `${rec.id} line ${line.lineNo}`, reportedValue: `${fmt(line.quantity)} ${line.unit}` },
        ]);
      } else if (roundQuantity(converted) !== roundQuantity(line.quantity)) {
        addConflict(`The reported quantity differs from the ordered quantity on ${rec.id} line ${line.lineNo}.`, [
          { evidenceId: sigEv, sourceLabel: `Signal ${latest.id}`, reportedValue: `${fmt(q.value)} ${q.unit}` },
          { evidenceId: promisedEvidence ?? "", sourceLabel: `${rec.id} line ${line.lineNo}`, reportedValue: `${fmt(line.quantity)} ${line.unit}` },
        ]);
      } else {
        addClaim(`The reported quantity matches the ordered quantity (${fmt(line.quantity)} ${line.unit})`, "verified", "Reported value compared with the order line after unit normalization.", [sigEv, promisedEvidence ?? ""].filter(Boolean));
      }
    }
  }

  // ---- Shipments ---------------------------------------------------------------------------------------
  let etaEvidence: string | null = null;
  let eta: string | null = null;
  const shipments = r.shipment?.record ? [r.shipment.record, ...r.shipments.filter((s) => s.id !== r.shipment?.record?.id)] : r.shipments;
  if (r.shipment && !r.shipment.found) {
    addUnknown(
      `Shipment ${r.shipment.key} was not found in the synthetic shipment records searched for this tenant`,
      "The carrier status and ETA cannot be confirmed.",
      `Check the shipment number ${r.shipment.key} with logistics.`,
    );
  }
  const primaryShipment = shipments.find((s) => s.status !== "cancelled") ?? null;
  for (const s of shipments.slice(0, 3)) {
    const ev = recordEvidence(
      s.meta,
      "shipment",
      `Shipment ${s.id} for ${s.purchaseOrderId}`,
      `Status ${s.status}${s.eta ? `, ETA ${s.eta}` : ", no ETA recorded"}${s.quantity !== null ? `, ${fmt(s.quantity)} ${s.unit}` : ""}.`,
      "shipments.status, eta, quantity",
    );
    if (s === primaryShipment) {
      etaEvidence = s.eta ? ev : null;
      eta = s.eta;
    }
    addClaim(`Shipment ${s.id} is ${s.status}${s.eta ? ` with ETA ${s.eta}` : " with no ETA recorded"}`, "verified", "Read from the shipment record.", [ev]);
    if (s.status === "delivered" && reportedDelay) {
      addConflict(`A delay is reported but shipment ${s.id} is recorded as delivered.`, [
        { evidenceId: signalEvidence.get(reportedDelay.s.id) ?? "", sourceLabel: `Signal ${reportedDelay.s.id}`, reportedValue: `Delayed ${reportedDelay.days} days` },
        { evidenceId: ev, sourceLabel: `Shipment ${s.id}`, reportedValue: "delivered" },
      ]);
    }
  }
  if (r.shipmentsSearched && shipments.length === 0) {
    addUnknown(
      `No shipment record was found for ${r.purchaseOrder?.key ?? "the purchase order"} in the searched records`,
      "Without a shipment there is no independent ETA; the arrival date rests on the supplier's report.",
      "Ask the supplier or forwarder for a booking or tracking reference.",
    );
  }
  const line = r.line;
  if (line && eta && reportedDelay && etaEvidence) {
    const etaDelay = daysBetween(line.promisedDate, eta);
    if (etaDelay !== reportedDelay.days) {
      const text = `The reported ${reportedDelay.days}-day delay disagrees with the shipment ETA (${etaDelay} day(s) after the promised date).`;
      dateConflicts.push(text);
      addConflict(text, [
        { evidenceId: signalEvidence.get(reportedDelay.s.id) ?? "", sourceLabel: `Signal ${reportedDelay.s.id}`, reportedValue: `${reportedDelay.days} days late` },
        { evidenceId: etaEvidence, sourceLabel: `Shipment ETA`, reportedValue: `${eta} (${etaDelay} days late)` },
      ]);
    }
  }

  // ---- Material ----------------------------------------------------------------------------------------
  if (r.material && !r.material.found) {
    addUnknown(
      `Material ${r.material.key} was not found in the synthetic material master searched for this tenant`,
      "Without the material record the specification and unit cannot be confirmed.",
      `Confirm the material code ${r.material.key}.`,
    );
  } else if (r.material?.record) {
    const m = r.material.record;
    const ev = recordEvidence(m.meta, "material_master", `Material ${m.id}`, `${m.description}; specification ${m.variant}; base unit ${m.baseUnit}.`, "materials.description, variant, base_unit");
    addClaim(`Material ${m.id} is ${m.description} (${m.variant})`, "verified", "Read from the material master.", [ev]);
  }
  if (!r.materialId && (r.references.purchaseOrder || r.references.shipment)) {
    addUnknown("Which material is affected", "Impact on inventory and production cannot be calculated without a material.", "Ask the source to name the material or order line.");
  }

  // ---- Lot / quality -----------------------------------------------------------------------------------
  const lotRows = r.lot?.record ?? [];
  if (r.lot && !r.lot.found) {
    addUnknown(
      `Lot ${r.lot.key} was not found in the inventory records searched for this tenant`,
      "Whether the lot is in stock, and where, cannot be confirmed.",
      `Check lot ${r.lot.key} in the warehouse system.`,
    );
  }
  const inspectionFailed = signals.some((s) => s.normalized.attributes.inspectionResult === "failed");
  for (const b of lotRows.slice(0, 5)) {
    const ev = balanceEvidence(b);
    addClaim(`Lot ${b.lot} of ${b.materialId} at ${b.locationName}: ${fmt(b.onHand)} ${b.unit}, quality ${b.qualityStatus}`, freshness(b), freshnessBasis(b), [ev]);
    if (inspectionFailed && b.qualityStatus === "released") {
      addConflict(`A failed inspection is reported for lot ${b.lot}, but the stock is recorded as released for use.`, [
        { evidenceId: latestEvidence ?? "", sourceLabel: "Quality signal", reportedValue: "Inspection failed" },
        { evidenceId: ev, sourceLabel: `Inventory ${b.id}`, reportedValue: "released" },
      ]);
    }
  }

  function freshness(b: InventoryBalanceRecord): ClaimState {
    const ageHours = (now.getTime() - new Date(b.countedAt).getTime()) / 3_600_000;
    return ageHours > INVENTORY_STALE_AFTER_HOURS ? "stale" : "verified";
  }
  function freshnessBasis(b: InventoryBalanceRecord): string {
    return freshness(b) === "stale"
      ? `Counted ${b.countedAt}, more than ${INVENTORY_STALE_AFTER_HOURS} hours ago; may no longer be current.`
      : `Read from the inventory record counted ${b.countedAt}.`;
  }
  function balanceEvidence(b: InventoryBalanceRecord): string {
    return recordEvidence(
      b.meta,
      "inventory_balance",
      `Inventory ${b.materialId} at ${b.locationName}${b.lot ? ` (lot ${b.lot})` : ""}`,
      `${fmt(b.onHand)} ${b.unit} on hand, quality ${b.qualityStatus}, counted ${b.countedAt}.`,
      "inventory_balances.on_hand, unit, quality_status, counted_at",
      freshness(b),
    );
  }

  // ---- Inventory at the focal location -----------------------------------------------------------------
  const atLocation = (r.inventory ?? []).filter((b) => !r.locationId || b.locationId === r.locationId);
  const balanceEvidenceIds: string[] = [];
  const lotIds = new Set(lotRows.map((b) => b.id));
  for (const b of atLocation.slice(0, 5)) {
    if (lotIds.has(b.id)) continue;
    const ev = balanceEvidence(b);
    balanceEvidenceIds.push(ev);
    addClaim(`${b.materialId} on hand at ${b.locationName}: ${fmt(b.onHand)} ${b.unit} (quality ${b.qualityStatus})`, freshness(b), freshnessBasis(b), [ev]);
  }
  if (r.inventory !== null && atLocation.length === 0 && r.materialId) {
    addUnknown(
      `No inventory balance for ${r.materialId}${r.locationId ? ` at ${r.locationId}` : ""} was found in the searched records`,
      "On-hand stock cannot be counted towards the requirement.",
      "Ask the warehouse for a current stock count.",
    );
  }
  if (atLocation.some((b) => b.qualityStatus === "unknown")) {
    addUnknown("Quality-release status of the on-hand stock", "Stock that is not quality-released cannot be used.", "Ask quality control whether the stock is released.");
  }
  if (atLocation.some((b) => freshness(b) === "stale")) {
    addUnknown("A current inventory count", "The latest count is older than 24 hours.", "Request a cycle count for this material and location.");
  }

  // ---- Reservations ------------------------------------------------------------------------------------
  const reservationEvidence: string[] = [];
  if (r.reservations) {
    for (const res of r.reservations.slice(0, 5)) {
      const ev = recordEvidence(res.meta, "inventory_reservation", `Reservation ${res.id}`, `${fmt(res.quantity)} ${res.unit} of ${res.materialId} reserved for ${res.productionOrderId} at ${res.locationId}.`, "inventory_reservations.quantity, production_order_id");
      reservationEvidence.push(ev);
    }
    if (r.reservations.length === 0) {
      addClaim(
        `No reservations are recorded for ${r.materialId} at ${r.locationId}`,
        "inferred",
        "Inferred from an empty result in the reservation records for this material and location; not confirmed by a person.",
        [],
      );
    }
  }

  // ---- Requirements ------------------------------------------------------------------------------------
  const requirementEvidence = new Map<string, string>();
  const reqs = [...(r.requirements ?? [])].sort((a, b) => (a.requiredBy < b.requiredBy ? -1 : 1));
  for (const q of reqs.slice(0, MAX_REQUIREMENT_CLAIMS)) {
    const ev = recordEvidence(q.meta, "production_order", `Requirement ${q.productionOrderId} / ${q.materialId}`, `${fmt(q.quantity)} ${q.unit} required by ${q.requiredBy} at ${q.locationId}; order status ${q.orderStatus}.`, "production_requirements.quantity, unit, required_by");
    requirementEvidence.set(q.productionOrderId, ev);
    addClaim(`${q.productionOrderId} requires ${fmt(q.quantity)} ${q.unit} of ${q.materialId} by ${q.requiredBy}`, "verified", "Read from the production requirement.", [ev]);
  }
  if (r.requirements !== null && reqs.length === 0) {
    addUnknown(
      `No open production requirement for ${r.materialId} in the window ${r.requirementWindow?.from} to ${r.requirementWindow?.to}`,
      "Without a requirement no order can be shown as affected; the delay may still matter for later orders.",
      "Check the production plan beyond the searched window.",
    );
  }

  if (r.skipped.length) {
    addUnknown(
      `Retrieval stopped early (call budget reached); not looked up: ${r.skipped.join(", ")}`,
      "Findings are based on partial evidence.",
      "Re-run the investigation after narrowing the references.",
    );
  }

  // ---- Delivery risk -----------------------------------------------------------------------------------
  let deliveryRisk: DeliveryRiskResult | null = null;
  if (line || primaryShipment) {
    const reqInputs: RequirementInput[] = reqs.map((q) => ({
      productionOrderId: q.productionOrderId,
      requiredBy: q.requiredBy,
      quantity: q.quantity,
      unit: q.unit,
      evidenceId: requirementEvidence.get(q.productionOrderId) ?? null,
    }));
    deliveryRisk = calculateDeliveryRisk({
      promised: { date: line?.promisedDate ?? null, state: line ? "verified" : "unknown", evidenceId: promisedEvidence },
      shipmentEta: eta ? { date: eta, state: "verified", evidenceId: etaEvidence } : null,
      reportedDelayDays: reportedDelay
        ? { days: reportedDelay.days, state: "reported", evidenceId: signalEvidence.get(reportedDelay.s.id) ?? null }
        : null,
      requirements: reqInputs,
      conflicts: dateConflicts,
      calculatedAt: nowIso,
    });
  }

  // ---- Shortage ----------------------------------------------------------------------------------------
  let shortage: ImpactCalculationResult | null = null;
  const pool = lotRows.length > 0 ? lotRows.filter((b) => !r.locationId || b.locationId === r.locationId) : atLocation;
  if (r.materialId && reqs.length > 0) {
    const arrival = deliveryRisk?.expectedArrival ?? null;
    const horizon = addDays(today, SHORTAGE_HORIZON_DAYS);
    const selected = reqs.filter((q) => (arrival ? q.requiredBy < arrival : q.requiredBy <= horizon));
    const targetUnit: Unit = r.material?.record?.baseUnit ?? reqs[0]!.unit;
    if (selected.length > 0) {
      shortage = shortageFor(selected, targetUnit, arrival);
    }
  }

  function shortageFor(selected: RequirementRecord[], targetUnit: Unit, arrival: string | null): ImpactCalculationResult {
    let required = 0;
    let requiredConvertible = true;
    for (const q of selected) {
      const c = convertQuantity(q.quantity, q.unit, targetUnit);
      if (c === null) requiredConvertible = false;
      else required += c;
    }
    const requiredInput: QuantityInput = {
      id: "required",
      label: arrival ? `Required before expected arrival (${arrival})` : `Required within ${SHORTAGE_HORIZON_DAYS} days`,
      value: requiredConvertible ? roundQuantity(required) : null,
      unit: requiredConvertible ? targetUnit : null,
      state: arrival && deliveryRisk?.arrivalBasis === "shipment_eta" ? "verified" : arrival ? "inferred" : "verified",
      evidenceId: requirementEvidence.get(selected[0]!.productionOrderId) ?? null,
    };

    const usablePool = pool.filter((b) => b.qualityStatus !== "hold");
    const counted = usablePool.length > 0 ? usablePool : pool;
    let onHand = 0;
    let onHandConvertible = counted.length > 0;
    for (const b of counted) {
      const c = convertQuantity(b.onHand, b.unit, targetUnit);
      if (c === null) onHandConvertible = false;
      else onHand += c;
    }
    const onHandInput: QuantityInput = {
      id: "on-hand",
      label: r.locationId ? `On hand at ${r.locationId}` : "On hand",
      value: onHandConvertible ? roundQuantity(onHand) : null,
      unit: onHandConvertible ? targetUnit : null,
      state: counted.some((b) => freshness(b) === "stale") ? "stale" : counted.length ? "verified" : "unknown",
      evidenceId: balanceEvidenceIds[0] ?? null,
    };

    const affected = new Set(selected.map((q) => q.productionOrderId));
    let reservedInput: QuantityInput | null = null;
    if (r.reservations) {
      const others = r.reservations.filter((res) => !affected.has(res.productionOrderId));
      let reserved = 0;
      let ok = true;
      for (const res of others) {
        const c = convertQuantity(res.quantity, res.unit, targetUnit);
        if (c === null) ok = false;
        else reserved += c;
      }
      reservedInput = {
        id: "reserved",
        label: "Reserved for other orders",
        value: ok ? roundQuantity(reserved) : null,
        unit: ok ? targetUnit : null,
        state: r.reservations.length === 0 ? "inferred" : "verified",
        evidenceId: reservationEvidence[0] ?? null,
      };
    }

    const released: boolean | null = usablePool.length === 0 && pool.length > 0 ? false : usablePool.some((b) => b.qualityStatus === "unknown") ? null : pool.length > 0 ? true : null;
    return calculateProvisionalShortage({
      required: requiredInput,
      onHand: onHandInput,
      reserved: reservedInput,
      quality: {
        released,
        state: released === null ? "unknown" : "verified",
        evidenceId: lotRows.length ? null : (balanceEvidenceIds[0] ?? null),
      },
      targetUnit,
      calculatedAt: nowIso,
    });
  }

  return {
    evidence,
    claims,
    unknowns,
    conflicts,
    shortage,
    deliveryRisk,
    entities: buildEntities(r, shipments.map((s) => s.id)),
    reportedDelayDays: reportedDelay?.days ?? null,
  };
}

function buildEntities(r: Retrieved, shipmentIds: string[]): { nodes: EntityNode[]; edges: EntityEdge[] } {
  const nodes: EntityNode[] = [];
  const edges: EntityEdge[] = [];
  const add = (n: EntityNode) => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
  };
  const po = r.purchaseOrder?.record ?? null;
  if (po) {
    add({ id: `supplier:${po.supplierId}`, kind: "supplier", label: po.supplierName, detail: po.supplierId, evidenceId: null });
    add({ id: `po:${po.id}`, kind: "purchase_order", label: po.id, detail: po.status, evidenceId: null });
    edges.push({ from: `supplier:${po.supplierId}`, to: `po:${po.id}`, relationship: "verified", basis: "purchase_orders.supplier_id" });
  } else if (r.references.purchaseOrder) {
    add({ id: `po:${r.references.purchaseOrder}`, kind: "purchase_order", label: r.references.purchaseOrder, detail: "Referenced by a signal; not found in records", evidenceId: null });
  }
  if (r.materialId) {
    const m = r.material?.record;
    add({ id: `material:${r.materialId}`, kind: "material", label: r.materialId, detail: m ? m.description : "Not confirmed in the material master", evidenceId: null });
    const poId = po?.id ?? r.references.purchaseOrder;
    if (poId) {
      edges.push({
        from: `po:${poId}`,
        to: `material:${r.materialId}`,
        relationship: r.line?.materialId === r.materialId ? "verified" : "inferred",
        basis: r.line?.materialId === r.materialId ? "purchase_order_lines.material_id" : "Named together in a signal",
      });
    }
  }
  for (const q of (r.requirements ?? []).slice(0, MAX_REQUIREMENT_CLAIMS)) {
    add({ id: `prod:${q.productionOrderId}`, kind: "production_order", label: q.productionOrderId, detail: `Needs ${fmt(q.quantity)} ${q.unit} by ${q.requiredBy}`, evidenceId: null });
    edges.push({ from: `material:${q.materialId}`, to: `prod:${q.productionOrderId}`, relationship: "verified", basis: "production_requirements.material_id" });
    add({ id: `loc:${q.locationId}`, kind: "factory", label: q.locationId, detail: "Production location", evidenceId: null });
    edges.push({ from: `prod:${q.productionOrderId}`, to: `loc:${q.locationId}`, relationship: "verified", basis: "production_orders.location_id" });
  }
  for (const id of shipmentIds.slice(0, 3)) {
    add({ id: `shipment:${id}`, kind: "shipment", label: id, detail: "Shipment record", evidenceId: null });
    if (po) edges.push({ from: `po:${po.id}`, to: `shipment:${id}`, relationship: "verified", basis: "shipments.purchase_order_id" });
  }
  if (r.shipment && !r.shipment.found) {
    add({ id: `shipment:${r.shipment.key}`, kind: "shipment", label: r.shipment.key, detail: "Referenced by a signal; not found in records", evidenceId: null });
  }
  return { nodes, edges };
}
