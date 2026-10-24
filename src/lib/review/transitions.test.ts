import { describe, expect, it } from "vitest";
import { applyTransition, assertTransition, InvalidTransitionError, TRANSITION_VERSION } from "./transitions";
import { makeCase } from "@/lib/store/investigation-contract";

describe("transitions.v1", () => {
  it("allows the documented edges and rejects the rest", () => {
    expect(TRANSITION_VERSION).toBe("transitions.v1");
    assertTransition("needs_review", "awaiting_approval");
    assertTransition("awaiting_approval", "approved");
    assertTransition("approved", "executing");
    assertTransition("executing", "awaiting_verification");
    assertTransition("awaiting_verification", "resolved");
    expect(() => assertTransition("approved", "resolved")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("executing", "resolved")).toThrow(InvalidTransitionError);
    expect(() => applyTransition(makeCase("INV-1", "t", { state: "approved" }), "resolved", "no", "2026-10-24T09:00:00.000Z")).toThrow(
      InvalidTransitionError,
    );
  });
});
