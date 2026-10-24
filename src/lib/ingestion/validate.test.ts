import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD_BYTES } from "@/lib/domain/signal-input";
import { makeInput, makeRaw } from "./test-helpers";
import { validateRawSignal } from "./validate";

function rejected(raw: string) {
  const result = validateRawSignal(raw);
  if (result.ok) throw new Error("expected rejection");
  return result.issues;
}

describe("validateRawSignal", () => {
  it("accepts a well-formed synthetic signal", () => {
    const result = validateRawSignal(makeRaw());
    expect(result.ok).toBe(true);
  });

  it("rejects invalid JSON without echoing the body", () => {
    expect(rejected("{ not json SECRET-TOKEN")).toEqual([{ path: "", code: "invalid_json" }]);
  });

  it("rejects a non-object body", () => {
    expect(rejected("[1,2,3]")[0]?.code).toBe("invalid_type");
  });

  it("rejects unknown keys, including tenant or role smuggling", () => {
    const issues = rejected(JSON.stringify({ ...makeInput(), tenantId: "tenant-other", role: "admin" }));
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: "tenantId", code: "unrecognized_key" },
        { path: "role", code: "unrecognized_key" },
      ]),
    );
  });

  it("rejects non-synthetic data mode", () => {
    const issues = rejected(JSON.stringify({ ...makeInput(), dataMode: "real" }));
    expect(issues).toEqual([{ path: "dataMode", code: "invalid_value" }]);
  });

  it("rejects negative, non-finite and unsupported quantities", () => {
    expect(rejected(makeRaw({ quantity: { value: -1, unit: "m" } }))[0]?.path).toBe("quantity.value");
    expect(rejected('{"quantity":{"value":1e999,"unit":"m"}}').some((i) => i.path === "quantity.value")).toBe(true);
    expect(rejected(makeRaw({ quantity: { value: 5, unit: "furlongs" } }))).toEqual([
      { path: "quantity.unit", code: "unsupported_unit" },
    ]);
  });

  it("rejects bad timestamps, oversize fields and bad enumerations", () => {
    expect(rejected(makeRaw({ sourceReportedAt: "yesterday" }))[0]?.path).toBe("sourceReportedAt");
    expect(rejected(makeRaw({ label: "x".repeat(201) }))[0]).toEqual({ path: "label", code: "too_big" });
    expect(rejected(makeRaw({ excerpt: "x".repeat(601) }))[0]?.path).toBe("excerpt");
    expect(rejected(JSON.stringify({ ...makeInput(), sourceType: "carrier_pigeon" }))[0]?.path).toBe("sourceType");
  });

  it("rejects payloads over the byte limit", () => {
    const raw = JSON.stringify({ ...makeInput(), padding: "x".repeat(MAX_PAYLOAD_BYTES) });
    expect(rejected(raw)).toEqual([{ path: "", code: "payload_too_large" }]);
  });

  it("never includes submitted values in issues, and sanitizes hostile key names", () => {
    const hostile = { ...makeInput(), "<script>alert(1)</script>": "SECRET-VALUE-123", label: "" };
    const issues = rejected(JSON.stringify(hostile));
    const text = JSON.stringify(issues);
    expect(text).not.toContain("SECRET-VALUE-123");
    expect(text).not.toContain("<script>");
  });
});
