import { describe, expect, it } from "vitest";
import { canonicalJson } from "./hash";
import { makeNormalized } from "./test-helpers";

describe("hashes", () => {
  it("canonicalJson is key-order independent", () => {
    expect(canonicalJson({ a: 1, b: { d: 2, c: 3 } })).toBe(canonicalJson({ b: { c: 3, d: 2 }, a: 1 }));
  });

  it("identical content gives identical hashes", () => {
    expect(makeNormalized().contentHash).toBe(makeNormalized().contentHash);
    expect(makeNormalized().fingerprint).toBe(makeNormalized().fingerprint);
  });

  it("content hash changes with the excerpt, fingerprint does not", () => {
    const a = makeNormalized({ excerpt: "first wording" });
    const b = makeNormalized({ excerpt: "second wording" });
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("fingerprint ignores timestamps and label case but not references or quantity", () => {
    const base = makeNormalized();
    expect(makeNormalized({ sourceReportedAt: "2026-10-24T01:00:00Z" }).fingerprint).toBe(base.fingerprint);
    expect(makeNormalized({ label: "SUPPLIER NOTICE: NAVY TWILL NV-4471 DELAYED FOUR DAYS" }).fingerprint).toBe(base.fingerprint);
    expect(makeNormalized({ references: { purchaseOrder: "PO-99999", material: "NV-4471" } }).fingerprint).not.toBe(base.fingerprint);
    expect(makeNormalized({ quantity: { value: 8001, unit: "m" } }).fingerprint).not.toBe(base.fingerprint);
  });
});
