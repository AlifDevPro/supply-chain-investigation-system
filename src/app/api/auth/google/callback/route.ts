import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeGoogleCode, oauthOrigin, OAUTH_COOKIE, readOauthTransaction } from "@/lib/auth/google-oauth";
import { accountFromGoogle, GoogleAccountError } from "@/lib/auth/register";
import { writeSessionCookie } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getGovernance, getLoginLimiter } from "@/lib/runtime";

function fail(reason: string): never {
  logEvent("info", "auth.google.failed", { reason });
  redirect("/login?error=google");
}

export async function GET(request: Request) {
  const env = getEnv();
  if (!env.SESSION_SECRET || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) fail("unconfigured");
  if (!getLoginLimiter().check("google-callback").allowed) redirect("/login?error=google_limited");
  const url = new URL(request.url);
  const origin = oauthOrigin(url.origin);
  if (!origin) fail("origin");
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.set(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  const pending = raw ? readOauthTransaction(raw, env.SESSION_SECRET) : null;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!pending || !state || !code || state !== pending.state || code.length > 2048) fail("state");
  try {
    const identity = await exchangeGoogleCode({
      code,
      verifier: pending.verifier,
      redirectUri: `${origin}/api/auth/google/callback`,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
    const store = await getGovernance();
    if (!store) fail("store");
    const user = await accountFromGoogle({ tenantId: store.tenantId, identity, governance: store.governance });
    await writeSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
    });
    logEvent("info", "auth.google", { userId: user.id, role: user.role });
    redirect(pending.next);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const reason = error instanceof GoogleAccountError ? error.reason : "exchange";
    fail(reason);
  }
}
