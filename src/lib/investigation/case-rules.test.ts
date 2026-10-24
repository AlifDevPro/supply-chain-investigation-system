import { describe, expect, it } from "vitest";
import { decideCase, matchOpenCase } from "./case-rules";
import { extractReportedDelayDays } from "./signals";
import { caseSignal } from "./test-helpers";

const open = [
  { caseId: "INV-3001", references: { purchaseOrder: "PO-1", material: "M-1" } },
  { caseId: "INV-3002", references: { material: "M-2", shipment: "SHP-9" } },
];

describe("decideCase (case-rules.v1)", () => {
  const base = { processingStatus: "triaged", references: {} };

  it("skips rejected, duplicate, irrelevant and untriaged signals", () => {
    expect(decideCase({ ...base, processingStatus: "rejected", triageOutcome: null }, open).action).toBe("skip");
    expect(decideCase({ ...base, processingStatus: "duplicate", triageOutcome: null }, open).action).toBe("skip");
    expect(decideCase({ ...base, triageOutcome: "irrelevant", references: { purchaseOrder: "PO-1" } }, open).action).toBe("skip");
  });

  it("creates cases for high-impact and relevant signals and holds uncertain ones", () => {
    expect(decideCase({ ...base, triageOutcome: "high_impact" }, open)).toEqual({ action: "create", reason: "origin" });
    expect(decideCase({ ...base, triageOutcome: "relevant" }, open)).toEqual({ action: "create", reason: "origin" });
    expect(decideCase({ ...base, processingStatus: "held_for_review", triageOutcome: "uncertain" }, open).action).toBe("hold");
  });

  it("lets an operator open an investigation for an uncertain signal", () => {
    expect(decideCase({ ...base, triageOutcome: "uncertain" }, open, { operator: true })).toEqual({ action: "create", reason: "operator_opened" });
  });

  it("attaches any eligible signal that shares a reference with an open case", () => {
    expect(decideCase({ ...base, triageOutcome: "relevant", references: { purchaseOrder: "PO-1" } }, open)).toEqual({
      action: "attach", caseId: "INV-3001", reason: "related_reference",
    });
    expect(decideCase({ ...base, triageOutcome: "uncertain", references: { shipment: "SHP-9" } }, open).action).toBe("attach");
  });

  it("prefers the most specific reference", () => {
    expect(matchOpenCase({ material: "M-2", purchaseOrder: "PO-1" }, open)).toBe("INV-3001");
    expect(matchOpenCase({ material: "M-9" }, open)).toBeNull();
  });

  it("does not relate signals about different purchase orders through a shared material", () => {
    expect(matchOpenCase({ purchaseOrder: "PO-2", material: "M-1" }, open)).toBeNull();
    expect(matchOpenCase({ material: "M-1" }, open)).toBe("INV-3001");
  });
});

describe("extractReportedDelayDays (delay-length.v1)", () => {
  const delay = (label: string, excerpt?: string) => extractReportedDelayDays(caseSignal("S", { label, ...(excerpt ? { excerpt } : {}) }));

  it("reads digits, number words and weeks", () => {
    expect(delay("Fabric delayed by 4 days")).toBe(4);
    expect(delay("Trim delivery delayed two days")).toBe(2);
    expect(delay("Shipment will be one week late")).toBe(7);
    expect(delay("Arrives three-days later than planned")).toBe(3);
  });

  it("prefers the excerpt over the label", () => {
    expect(delay("Trim delayed two days", "Update: the delay is now five days.")).toBe(5);
  });

  it("returns null without delay language or a stated length", () => {
    expect(delay("Lead time is 30 days")).toBeNull();
    expect(delay("Supplier says lining will be late")).toBeNull();
  });
});
