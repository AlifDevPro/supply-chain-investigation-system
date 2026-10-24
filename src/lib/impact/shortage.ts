import type { ClaimState, ImpactCalculationResult, ImpactInput, Unit } from "@/lib/domain";

/**
 * Deterministic material shortage calculation (AGENTS.md section 7).
 *
 * Rules (rule version `shortage.v1`):
 *  - usable = onHand - reserved, only if the stock is quality-released; floor at 0.
 *  - deficit = max(0, required - usable).
 *  - Missing required or on-hand quantities make the calculation `incalculable`; a missing value is
 *    never replaced by zero.
 *  - Unknown reservations and unknown quality status are recorded as explicit assumptions and as
 *    missing evidence. The result is then `provisional`.
 *  - The result is `verified` only when every input is verified, reservations are known and the stock
 *    is confirmed quality-released. Conflicting data can never be `verified`.
 *  - Units: m and yd are convertible (1 yd = 0.9144 m). kg and pcs convert only to themselves.
 *    Incompatible units make the calculation `incalculable` and are reported as a conflict.
 *  - Rounding: results are rounded half-up to 3 decimals in the target unit.
 *  - Invalid numbers (negative, NaN, Infinity) throw `InvalidQuantityError`; they are programming or
 *    ingestion errors, not business states.
 *  - Time: `calculatedAt` is supplied by the caller so the function stays pure.
 */

export const SHORTAGE_RULE_VERSION = "shortage.v1";

const YARD_IN_METRES = 0.9144;

export class InvalidQuantityError extends Error {
  constructor(label: string, value: number) {
    super(`Invalid quantity for "${label}": ${value}. Quantities must be finite and non-negative.`);
    this.name = "InvalidQuantityError";
  }
}

export type QuantityInput = {
  id: string;
  label: string;
  value: number | null;
  unit: Unit | null;
  state: ClaimState;
  evidenceId: string | null;
};

export type QualityReleaseInput = {
  /** true = released and usable, false = on hold, null = unknown. */
  released: boolean | null;
  state: ClaimState;
  evidenceId: string | null;
};

export type ShortageInput = {
  required: QuantityInput;
  onHand: QuantityInput;
  /** null means reservation records were not retrieved at all. */
  reserved: QuantityInput | null;
  quality: QualityReleaseInput;
  targetUnit: Unit;
  /** ISO timestamp supplied by the caller. */
  calculatedAt: string;
};

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Returns null when the units are incompatible. */
export function convertQuantity(value: number, from: Unit, to: Unit): number | null {
  if (from === to) return value;
  if (from === "yd" && to === "m") return value * YARD_IN_METRES;
  if (from === "m" && to === "yd") return value / YARD_IN_METRES;
  return null;
}

function assertValid(q: QuantityInput): void {
  if (q.value === null) return;
  if (!Number.isFinite(q.value) || q.value < 0) throw new InvalidQuantityError(q.label, q.value);
}

function toInput(q: QuantityInput, converted: number | null, target: Unit): ImpactInput {
  let note: string | null = null;
  if (q.value !== null && q.unit !== null && converted !== null && q.unit !== target) {
    note = `Converted: ${roundQuantity(converted)} ${target}`;
  } else if (q.value === null) {
    note = "Value missing in the source record";
  }
  return {
    id: q.id,
    label: q.label,
    value: q.value,
    unit: q.unit,
    state: q.state,
    evidenceId: q.evidenceId,
    note,
  };
}

export function calculateProvisionalShortage(input: ShortageInput): ImpactCalculationResult {
  const { required, onHand, reserved, quality, targetUnit } = input;
  for (const q of [required, onHand, reserved]) if (q) assertValid(q);

  const assumptions: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];

  const convert = (q: QuantityInput): number | null => {
    if (q.value === null || q.unit === null) return null;
    const out = convertQuantity(q.value, q.unit, targetUnit);
    if (out === null) {
      conflicts.push(
        `${q.label} is recorded in "${q.unit}" and cannot be converted to "${targetUnit}" without a verified conversion.`,
      );
    }
    return out;
  };

  const requiredQty = convert(required);
  const onHandQty = convert(onHand);
  const reservedQty = reserved ? convert(reserved) : null;

  const inputs: ImpactInput[] = [
    toInput(required, requiredQty, targetUnit),
    toInput(onHand, onHandQty, targetUnit),
  ];
  if (reserved) {
    inputs.push(toInput(reserved, reservedQty, targetUnit));
  } else {
    // Make the absence visible: reservations were never retrieved, which is not the same as zero.
    inputs.push({
      id: "reserved-not-retrieved",
      label: "Reserved stock",
      value: null,
      unit: null,
      state: "unknown",
      evidenceId: null,
      note: "Reservation records not retrieved",
    });
  }
  inputs.push({
    id: "quality-release",
    label: "Quality release of on-hand stock",
    value: null,
    unit: null,
    state: quality.state,
    evidenceId: quality.evidenceId,
    note:
      quality.released === null
        ? "Unknown"
        : quality.released
          ? "Released for use"
          : "On quality hold: not usable",
  });

  const base = {
    ruleVersion: SHORTAGE_RULE_VERSION,
    method: "deficit = max(0, required - (on hand - reserved)), counting only quality-released stock",
    calculatedAt: input.calculatedAt,
    unit: targetUnit,
    inputs,
    assumptions,
    missing,
    conflicts,
  };

  if (required.value === null || required.unit === null) {
    missing.push(`${required.label} (quantity and unit)`);
  }
  if (onHand.value === null || onHand.unit === null) {
    missing.push(`${onHand.label} (quantity and unit)`);
  }
  if (requiredQty === null || onHandQty === null) {
    return {
      ...base,
      deficit: null,
      usableQuantity: null,
      requiredQuantity: requiredQty === null ? null : roundQuantity(requiredQty),
      status: "incalculable",
    };
  }

  let reservedForCalc = 0;
  if (reserved === null || reserved.value === null) {
    assumptions.push("Reservations were not retrieved; no stock is assumed to be reserved.");
    missing.push("Inventory reservation records for this material and location");
  } else if (reservedQty !== null) {
    reservedForCalc = reservedQty;
  }

  let usable = Math.max(0, onHandQty - reservedForCalc);
  if (reservedForCalc > onHandQty) {
    conflicts.push("Reserved quantity exceeds on-hand quantity; the source records are inconsistent.");
  }

  if (quality.released === null) {
    assumptions.push("Quality status is unknown; on-hand stock is assumed to be released for use.");
    missing.push("Quality-release status of the on-hand stock");
  } else if (!quality.released) {
    usable = 0;
  }

  const deficit = Math.max(0, requiredQty - usable);

  const unverified: string[] = [];
  const checks: Array<[string, ClaimState]> = [
    [required.label, required.state],
    [onHand.label, onHand.state],
    ...(reserved ? ([[reserved.label, reserved.state]] as Array<[string, ClaimState]>) : []),
    ["Quality release", quality.state],
  ];
  for (const [label, state] of checks) {
    if (state !== "verified") unverified.push(`Verify "${label}" (currently ${state})`);
  }
  missing.push(...unverified.filter((u) => !missing.some((m) => u.includes(m))));

  const fullyVerified =
    unverified.length === 0 &&
    reserved !== null &&
    reserved.value !== null &&
    quality.released === true &&
    conflicts.length === 0;

  return {
    ...base,
    deficit: roundQuantity(deficit),
    usableQuantity: roundQuantity(usable),
    requiredQuantity: roundQuantity(requiredQty),
    status: fullyVerified ? "verified" : "provisional",
  };
}
