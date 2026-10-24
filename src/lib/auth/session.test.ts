import { describe, expect, it } from "vitest";
import { signSession, verifySessionToken, type SessionUser } from "./session-crypto";

const SECRET = "a".repeat(32);
const user: SessionUser = {
  userId: "USR-MANAGER",
  tenantId: "tenant-demo",
  role: "manager",
  displayName: "Demo manager",
  email: "manager@demo.local",
};

describe("signed session", () => {
  it("round-trips a valid token", () => {
    const token = signSession(user, SECRET, Date.parse("2026-10-24T09:00:00.000Z"));
    expect(verifySessionToken(token, SECRET, Date.parse("2026-10-24T10:00:00.000Z"))).toEqual(user);
  });

  it("rejects a forged signature and an expired token", () => {
    const token = signSession(user, SECRET, Date.parse("2026-10-24T09:00:00.000Z"));
    expect(verifySessionToken(`${token.slice(0, -2)}xx`, SECRET, Date.parse("2026-10-24T10:00:00.000Z"))).toBeNull();
    expect(verifySessionToken(token, SECRET, Date.parse("2026-10-25T09:00:00.000Z"))).toBeNull();
    expect(verifySessionToken(token, "b".repeat(32), Date.parse("2026-10-24T10:00:00.000Z"))).toBeNull();
  });
});
