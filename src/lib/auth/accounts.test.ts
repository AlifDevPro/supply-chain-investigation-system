import { describe, expect, it } from "vitest";
import { memoryRuntime } from "@/test/memory-runtime";
import { accountFromGoogle, EmailTakenError, GoogleAccountError, registerPasswordUser } from "./register";
import { exchangeGoogleCode, oauthOrigin, readOauthTransaction, createOauthTransaction } from "./google-oauth";
import { verifyPassword } from "./password";

describe("registerPasswordUser", () => {
  it("creates a reviewer and rejects a duplicate email", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    const user = await registerPasswordUser({
      tenantId: "tenant-demo",
      email: "New.User@Demo.Local",
      displayName: "New user",
      password: "long-enough-pass",
      governance: runtime.governance,
    });
    expect(user.role).toBe("reviewer");
    expect(user.email).toBe("new.user@demo.local");
    expect(user.googleSub).toBeNull();
    expect(await verifyPassword("long-enough-pass", user.passwordHash!)).toBe(true);
    await expect(
      registerPasswordUser({
        tenantId: "tenant-demo",
        email: "new.user@demo.local",
        displayName: "Again",
        password: "another-password",
        governance: runtime.governance,
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });
});

describe("accountFromGoogle", () => {
  it("creates a reviewer and keeps an existing role when the email already exists", async () => {
    const runtime = await memoryRuntime("tenant-demo");
    const created = await accountFromGoogle({
      tenantId: "tenant-demo",
      identity: { sub: "sub-1", email: "google.user@demo.local", emailVerified: true, name: "Google User" },
      governance: runtime.governance,
    });
    expect(created.role).toBe("reviewer");
    expect(created.passwordHash).toBeNull();
    const again = await accountFromGoogle({
      tenantId: "tenant-demo",
      identity: { sub: "sub-1", email: "google.user@demo.local", emailVerified: true, name: "Google User" },
      governance: runtime.governance,
    });
    expect(again.id).toBe(created.id);
    const linked = await accountFromGoogle({
      tenantId: "tenant-demo",
      identity: { sub: "sub-manager", email: "manager@demo.local", emailVerified: true, name: "Ignored" },
      governance: runtime.governance,
    });
    expect(linked.id).toBe("USR-MANAGER");
    expect(linked.role).toBe("manager");
    await expect(
      accountFromGoogle({
        tenantId: "tenant-demo",
        identity: { sub: "sub-x", email: "unverified@demo.local", emailVerified: false, name: "No" },
        governance: runtime.governance,
      }),
    ).rejects.toBeInstanceOf(GoogleAccountError);
  });
});

describe("google oauth helpers", () => {
  it("rejects a forged state cookie and a non-local http origin", () => {
    const tx = createOauthTransaction("/review", "x".repeat(32));
    expect(readOauthTransaction(tx.cookie, "x".repeat(32))?.next).toBe("/review");
    expect(readOauthTransaction(`${tx.cookie}tampered`, "x".repeat(32))).toBeNull();
    expect(oauthOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(oauthOrigin("http://evil.example")).toBeNull();
    expect(oauthOrigin("https://app.example")).toBe("https://app.example");
  });

  it("reads a verified email from the userinfo response and drops the access token", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("token")) {
        return new Response(JSON.stringify({ access_token: "secret-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ sub: "abc", email: "a@demo.local", email_verified: true, name: "A" }), { status: 200 });
    }) as typeof fetch;
    const identity = await exchangeGoogleCode({
      code: "code",
      verifier: "verifier",
      redirectUri: "http://localhost:3000/api/auth/google/callback",
      clientId: "client",
      clientSecret: "secret",
      fetchImpl,
    });
    expect(identity).toEqual({ sub: "abc", email: "a@demo.local", emailVerified: true, name: "A" });
  });
});
