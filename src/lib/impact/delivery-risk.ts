import type { ClaimState, DeliveryRiskResult, ImpactInput, Unit } from "@/lib/domain";
import { addDays, daysBetween } from "./dates";

/**
 * Deterministic delivery-risk calculation (AGENTS.md section 7), rule version `delivery-risk.v1`.
 *
 *  - Expected arrival, in order of preference: shipment ETA from the shipment record; else promised date plus
 *    a reported delay (from the signal); else the promised date itself (no delay evidence).
 *  - delayDays = expectedArrival - promisedDate, in UTC calendar days.
 *  - Affected orders: open requirements for the material whose required-by date is strictly before the
 *    expected arrival (the material arrives after it is needed).
 *  - slackDays = earliestRequiredBy - expectedArrival (negative: arrives late for the earliest requirement).
 *  - Status: `incalculable` without a promised date or expected arrival; `verified` only when the promised
 *    date and the arrival come from verified records and no conflict exists; otherwise `provisional`.
 *  - Dates are YYYY-MM-DD; invalid dates throw (`InvalidDateError`) because they are data errors.
 */
export const DELIVERY_RISK_RULE_VERSION = "delivery-risk.v1";

export interface DatedInput {
  date: string | null;
  state: ClaimState;
  evidenceId: string | null;
}

export interface RequirementInput {
  productionOrderId: string;
  requiredBy: string;
  quantity: number;
  unit: Unit;
  evidenceId: string | null;
}

export interface DeliveryRiskInput {
  promised: DatedInput;
  shipmentEta: DatedInput | null;
  /** Delay in days reported by a source, when it states one. */
  reportedDelayDays: { days: number; state: ClaimState; evidenceId: string | null } | null;
  requirements: readonly RequirementInput[];
  /** Conflicts already detected between sources about the dates. */
  conflicts: readonly string[];
  calculatedAt: string;
}

export function calculateDeliveryRisk(input: DeliveryRiskInput): DeliveryRiskResult {
  const assumptions: string[] = [];
  const missing: string[] = [];
  const conflicts = [...input.conflicts];
  const inputs: ImpactInput[] = [];

  const promised = input.promised.date;
  inputs.push({
    id: "promised-date",
    label: "Promised delivery date",
    value: null,
    unit: null,
    state: promised ? input.promised.state : "unknown",
    evidenceId: input.promised.evidenceId,
    note: promised ?? "Not found in the searched purchase-order records",
  });
  if (!promised) missing.push("Promised delivery date on the purchase-order line");

  let expectedArrival: string | null = null;
  let arrivalBasis: DeliveryRiskResult["arrivalBasis"] = "none";
  let arrivalState: ClaimState = "unknown";
  let arrivalEvidence: string | null = null;

  if (input.shipmentEta?.date) {
    expectedArrival = input.shipmentEta.date;
    arrivalBasis = "shipment_eta";
    arrivalState = input.shipmentEta.state;
    arrivalEvidence = input.shipmentEta.evidenceId;
  } else if (promised && input.reportedDelayDays) {
    expectedArrival = addDays(promised, input.reportedDelayDays.days);
    arrivalBasis = "reported_delay";
    arrivalState = input.reportedDelayDays.state;
    arrivalEvidence = input.reportedDelayDays.evidenceId;
    assumptions.push(
      `Expected arrival is the promised date plus the reported ${input.reportedDelayDays.days}-day delay; no shipment ETA was found.`,
    );
    missing.push("Shipment record with a confirmed ETA");
  } else if (promised) {
    expectedArrival = promised;
    arrivalBasis = "promised_date";
    arrivalState = "assumed";
    assumptions.push("No shipment ETA and no stated delay length: the promised date is used as the expected arrival.");
    missing.push("Shipment ETA or the length of the reported delay");
  }

  inputs.push({
    id: "expected-arrival",
    label: "Expected arrival",
    value: null,
    unit: null,
    state: arrivalState,
    evidenceId: arrivalEvidence,
    note: expectedArrival ? `${expectedArrival} (${arrivalBasis.replace("_", " ")})` : "Cannot be determined",
  });

  const sorted = [...input.requirements].sort((a, b) => (a.requiredBy < b.requiredBy ? -1 : a.requiredBy > b.requiredBy ? 1 : 0));
  for (const r of sorted) {
    inputs.push({
      id: `requirement-${r.productionOrderId}`,
      label: `Requirement ${r.productionOrderId}`,
      value: r.quantity,
      unit: r.unit,
      state: "verified",
      evidenceId: r.evidenceId,
      note: `Required by ${r.requiredBy}`,
    });
  }
  if (sorted.length === 0) missing.push("Open production requirements for this material");

  const base = {
    ruleVersion: DELIVERY_RISK_RULE_VERSION,
    method: "delay = expected arrival - promised date; affected = requirements due before expected arrival; slack = earliest required-by - expected arrival",
    calculatedAt: input.calculatedAt,
    promisedDate: promised,
    expectedArrival,
    arrivalBasis,
    inputs,
    assumptions,
    missing,
    conflicts,
  };

  if (!promised || !expectedArrival) {
    return { ...base, status: "incalculable", delayDays: null, earliestRequiredBy: null, slackDays: null, affectedOrders: [] };
  }

  const delayDays = daysBetween(promised, expectedArrival);
  const earliest = sorted[0]?.requiredBy ?? null;
  const slackDays = earliest ? daysBetween(expectedArrival, earliest) : null;
  const affectedOrders = sorted
    .filter((r) => daysBetween(r.requiredBy, expectedArrival) > 0)
    .map((r) => ({ productionOrderId: r.productionOrderId, requiredBy: r.requiredBy, quantity: r.quantity, unit: r.unit, evidenceId: r.evidenceId }));

  const verified =
    input.promised.state === "verified" && arrivalBasis === "shipment_eta" && arrivalState === "verified" && conflicts.length === 0;

  return {
    ...base,
    status: verified ? "verified" : "provisional",
    delayDays,
    earliestRequiredBy: earliest,
    slackDays,
    affectedOrders,
  };
}
