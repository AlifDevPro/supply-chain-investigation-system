import { describe, expect, it } from "vitest";
import {
  calculateProvisionalShortage,
  convertQuantity,
  InvalidQuantityError,
  roundQuantity,
  type QuantityInput,
  type ShortageInput,
} from "./shortage";

const AT = "2026-10-24T04:10:00Z";

const q = (over: Partial<QuantityInput> & Pick<QuantityInput, "id" | "label">): QuantityInput => ({
  value: null,
  unit: "m",
  state: "reported",
  evidenceId: null,
  ...over,
});

function base(over: Partial<ShortageInput> = {}): ShortageInput {
  return {
    required: q({ id: "req", label: "Production requirement", value: 6000 }),
    onHand: q({ id: "oh", label: "On-hand stock", value: 500 }),
    reserved: null,
    quality: { released: null, state: "unknown", evidenceId: null },
    targetUnit: "m",
    calculatedAt: AT,
    ...over,
  };
}

describe("calculateProvisionalShortage", () => {
  it("README example: 6,000 - 500 = 5,500 m is PROVISIONAL with explicit assumptions and missing evidence", () => {
    const r = calculateProvisionalShortage(base());
    expect(r.deficit).toBe(5500);
    expect(r.status).toBe("provisional");
    expect(r.assumptions.join(" ")).toMatch(/Reservations were not retrieved/);
    expect(r.assumptions.join(" ")).toMatch(/Quality status is unknown/);
    expect(r.missing.join(" ")).toMatch(/reservation records/i);
    expect(r.missing.join(" ")).toMatch(/Quality-release status/);
    expect(r.ruleVersion).toBe("shortage.v1");
    expect(r.calculatedAt).toBe(AT);
  });

  it("shows reservations as an explicit unknown input when they were never retrieved, not as zero", () => {
    const r = calculateProvisionalShortage(base());
    const row = r.inputs.find((i) => i.id === "reserved-not-retrieved");
    expect(row).toMatchObject({ value: null, state: "unknown", note: "Reservation records not retrieved" });
  });

  it("subtracts known reservations and flags unverified inputs", () => {
    const r = calculateProvisionalShortage(
      base({
        reserved: q({ id: "res", label: "Reserved stock", value: 200, state: "reported" }),
        quality: { released: true, state: "verified", evidenceId: "ev-q" },
      }),
    );
    expect(r.usableQuantity).toBe(300);
    expect(r.deficit).toBe(5700);
    expect(r.status).toBe("provisional");
    expect(r.missing.some((m) => m.includes("Production requirement"))).toBe(true);
  });

  it("is verified only when every input is verified, reservations known and stock released", () => {
    const v = (id: string, label: string, value: number) => q({ id, label, value, state: "verified" });
    const r = calculateProvisionalShortage(
      base({
        required: v("req", "Production requirement", 6000),
        onHand: v("oh", "On-hand stock", 500),
        reserved: v("res", "Reserved stock", 100),
        quality: { released: true, state: "verified", evidenceId: "ev-q" },
      }),
    );
    expect(r.status).toBe("verified");
    expect(r.deficit).toBe(5600);
    expect(r.missing).toEqual([]);
    expect(r.assumptions).toEqual([]);
  });

  it("treats stock on quality hold as unusable", () => {
    const r = calculateProvisionalShortage(
      base({ quality: { released: false, state: "verified", evidenceId: "ev-q" } }),
    );
    expect(r.usableQuantity).toBe(0);
    expect(r.deficit).toBe(6000);
  });

  it("returns a zero deficit (not negative) when stock exceeds the requirement", () => {
    const r = calculateProvisionalShortage(
      base({ onHand: q({ id: "oh", label: "On-hand stock", value: 9000 }) }),
    );
    expect(r.deficit).toBe(0);
  });

  it("never treats missing on-hand stock as zero", () => {
    const r = calculateProvisionalShortage(
      base({ onHand: q({ id: "oh", label: "On-hand stock", value: null }) }),
    );
    expect(r.status).toBe("incalculable");
    expect(r.deficit).toBeNull();
    expect(r.missing.join(" ")).toMatch(/On-hand stock/);
  });

  it("is incalculable when the requirement is missing", () => {
    const r = calculateProvisionalShortage(
      base({ required: q({ id: "req", label: "Production requirement", value: null }) }),
    );
    expect(r.status).toBe("incalculable");
    expect(r.requiredQuantity).toBeNull();
  });

  it("converts yards to metres and records the conversion", () => {
    const r = calculateProvisionalShortage(
      base({ onHand: q({ id: "oh", label: "On-hand stock", value: 1000, unit: "yd" }) }),
    );
    expect(r.usableQuantity).toBe(914.4);
    expect(r.deficit).toBe(5085.6);
    expect(r.inputs[1]?.note).toBe("Converted: 914.4 m");
  });

  it("reports incompatible units as a conflict and is incalculable", () => {
    const r = calculateProvisionalShortage(
      base({ onHand: q({ id: "oh", label: "On-hand stock", value: 500, unit: "kg" }) }),
    );
    expect(r.status).toBe("incalculable");
    expect(r.conflicts.join(" ")).toMatch(/cannot be converted/);
  });

  it("flags reserved > on-hand as a conflict and never verifies it", () => {
    const v = (id: string, label: string, value: number) => q({ id, label, value, state: "verified" });
    const r = calculateProvisionalShortage(
      base({
        required: v("req", "Production requirement", 6000),
        onHand: v("oh", "On-hand stock", 500),
        reserved: v("res", "Reserved stock", 800),
        quality: { released: true, state: "verified", evidenceId: "ev-q" },
      }),
    );
    expect(r.usableQuantity).toBe(0);
    expect(r.conflicts.join(" ")).toMatch(/exceeds on-hand/);
    expect(r.status).toBe("provisional");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid quantity %s", (value) => {
    expect(() =>
      calculateProvisionalShortage(base({ onHand: q({ id: "oh", label: "On-hand stock", value }) })),
    ).toThrow(InvalidQuantityError);
  });
});

describe("helpers", () => {
  it("rounds half-up to 3 decimals", () => {
    expect(roundQuantity(1.0005)).toBe(1.001);
    expect(roundQuantity(2.00049)).toBe(2);
  });

  it("converts between m and yd and refuses incompatible units", () => {
    expect(convertQuantity(100, "yd", "m")).toBeCloseTo(91.44, 6);
    expect(convertQuantity(91.44, "m", "yd")).toBeCloseTo(100, 6);
    expect(convertQuantity(1, "kg", "m")).toBeNull();
  });
});
