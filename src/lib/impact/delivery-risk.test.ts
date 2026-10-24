import { describe, expect, it } from "vitest";
import { addDays, daysBetween, InvalidDateError, utcDate } from "./dates";
import { calculateDeliveryRisk, type DeliveryRiskInput } from "./delivery-risk";

const AT = "2026-10-24T06:00:00.000Z";

function input(overrides: Partial<DeliveryRiskInput> = {}): DeliveryRiskInput {
  return {
    promised: { date: "2026-10-27", state: "verified", evidenceId: "EV-PO" },
    shipmentEta: null,
    reportedDelayDays: null,
    requirements: [
      { productionOrderId: "PRD-2", requiredBy: "2026-11-05", quantity: 4000, unit: "m", evidenceId: "EV-R2" },
      { productionOrderId: "PRD-1", requiredBy: "2026-10-29", quantity: 6000, unit: "m", evidenceId: "EV-R1" },
    ],
    conflicts: [],
    calculatedAt: AT,
    ...overrides,
  };
}

describe("dates", () => {
  it("counts UTC calendar days across month, year and DST boundaries", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-11-02", "2026-10-30")).toBe(-3);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("takes the UTC date of an instant regardless of local offset", () => {
    expect(utcDate("2026-10-24T23:30:00-02:00")).toBe("2026-10-25");
    expect(utcDate("2026-10-25T01:00:00+06:00")).toBe("2026-10-24");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(InvalidDateError);
    expect(() => addDays("24/10/2026", 1)).toThrow(InvalidDateError);
    expect(() => addDays("2026-10-24", 1.5)).toThrow(RangeError);
  });
});

describe("calculateDeliveryRisk (delivery-risk.v1)", () => {
  it("uses the shipment ETA first and is verified when both dates are verified records", () => {
    const r = calculateDeliveryRisk(input({ shipmentEta: { date: "2026-10-31", state: "verified", evidenceId: "EV-SHP" } }));
    expect(r.status).toBe("verified");
    expect(r.arrivalBasis).toBe("shipment_eta");
    expect(r.delayDays).toBe(4);
    expect(r.earliestRequiredBy).toBe("2026-10-29");
    expect(r.slackDays).toBe(-2);
    expect(r.affectedOrders.map((o) => o.productionOrderId)).toEqual(["PRD-1"]);
  });

  it("falls back to promised date plus a reported delay and stays provisional", () => {
    const r = calculateDeliveryRisk(input({ reportedDelayDays: { days: 4, state: "reported", evidenceId: "EV-SIG" } }));
    expect(r.status).toBe("provisional");
    expect(r.arrivalBasis).toBe("reported_delay");
    expect(r.expectedArrival).toBe("2026-10-31");
    expect(r.missing).toContain("Shipment record with a confirmed ETA");
    expect(r.assumptions.join(" ")).toMatch(/reported 4-day delay/);
  });

  it("assumes the promised date when nothing states a delay, and says so", () => {
    const r = calculateDeliveryRisk(input());
    expect(r.arrivalBasis).toBe("promised_date");
    expect(r.delayDays).toBe(0);
    expect(r.affectedOrders).toEqual([]);
    expect(r.status).toBe("provisional");
    expect(r.inputs.find((i) => i.id === "expected-arrival")?.state).toBe("assumed");
  });

  it("is incalculable without a promised date and never invents one", () => {
    const r = calculateDeliveryRisk(
      input({ promised: { date: null, state: "unknown", evidenceId: null }, reportedDelayDays: { days: 4, state: "reported", evidenceId: "EV" } }),
    );
    expect(r.status).toBe("incalculable");
    expect(r.delayDays).toBeNull();
    expect(r.missing).toContain("Promised delivery date on the purchase-order line");
  });

  it("can never be verified while a conflict exists", () => {
    const r = calculateDeliveryRisk(
      input({ shipmentEta: { date: "2026-10-31", state: "verified", evidenceId: "EV" }, conflicts: ["Sources disagree"] }),
    );
    expect(r.status).toBe("provisional");
    expect(r.conflicts).toEqual(["Sources disagree"]);
  });

  it("does not count a requirement due on the arrival day as affected", () => {
    const r = calculateDeliveryRisk(input({ shipmentEta: { date: "2026-10-29", state: "verified", evidenceId: "EV" } }));
    expect(r.affectedOrders).toEqual([]);
    expect(r.slackDays).toBe(0);
  });

  it("reports missing requirements instead of assuming there are none", () => {
    const r = calculateDeliveryRisk(input({ requirements: [] }));
    expect(r.earliestRequiredBy).toBeNull();
    expect(r.slackDays).toBeNull();
    expect(r.missing).toContain("Open production requirements for this material");
  });
});
