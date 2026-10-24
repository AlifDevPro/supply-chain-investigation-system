import { describe, expect, it } from "vitest";
import { normalizeSignal } from "./normalize";
import { makeInput } from "./test-helpers";

describe("normalizeSignal", () => {
  it("uppercases identifiers, maps unit synonyms and converts timestamps to UTC", () => {
    const n = normalizeSignal(
      makeInput({
        sourceRecordId: " msg-1 ",
        sourceReportedAt: "2026-10-24T09:00:00+05:00",
        references: { purchaseOrder: "po-77120", material: " nv-4471 " },
        quantity: { value: 8000, unit: "Metres" },
      }),
    );
    expect(n.sourceRecordId).toBe("MSG-1");
    expect(n.sourceReportedAt).toBe("2026-10-24T04:00:00.000Z");
    expect(n.references.purchaseOrder).toBe("PO-77120");
    expect(n.references.material).toBe("NV-4471");
    expect(n.quantity).toEqual({ value: 8000, unit: "m" });
  });

  it("keeps missing fields as explicit nulls and never invents values", () => {
    const n = normalizeSignal({ sourceType: "manual_report", sourceSystem: "x", label: "y", dataMode: "synthetic" });
    expect(n.sourceRecordId).toBeNull();
    expect(n.sourceReportedAt).toBeNull();
    expect(n.excerpt).toBeNull();
    expect(n.quantity).toBeNull();
    expect(n.references).toEqual({ purchaseOrder: null, material: null, shipment: null, lot: null, productionOrder: null });
    expect(n.attributes).toEqual({ inspectionResult: null, routineSync: null, varianceDetected: null });
  });

  it("applies NFC and collapses whitespace", () => {
    const n = normalizeSignal(makeInput({ label: "Cafe\u0301   delay\n notice" }));
    expect(n.label).toBe("Caf\u00e9 delay notice");
  });

  it("does not mutate the input", () => {
    const input = makeInput();
    const copy = structuredClone(input);
    normalizeSignal(input);
    expect(input).toEqual(copy);
  });
});
