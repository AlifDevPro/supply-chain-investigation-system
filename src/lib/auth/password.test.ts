import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password and rejects a wrong one", async () => {
    const hash = await hashPassword("a-correct-password");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("a-correct-password", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(await verifyPassword("a-correct-password", "not-a-hash")).toBe(false);
  });
});
