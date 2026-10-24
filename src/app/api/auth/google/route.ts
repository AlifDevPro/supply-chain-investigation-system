import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleAuthorizeUrl, googleConfigured, oauthOrigin, OAUTH_COOKIE, createOauthTransaction } from "@/lib/auth/google-oauth";
import { safeNext } from "@/lib/auth/safe-next";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getLoginLimiter } from "@/lib/runtime";

export async function GET(request: Request) {
  const env = getEnv();
  if (!env.SESSION_SECRET || !googleConfigured(env)) redirect("/login?error=google_unconfigured");
  if (!getLoginLimiter().check("google").allowed) redirect("/login?error=google_limited");
  const origin = oauthOrigin(new URL(request.url).origin);
  if (!origin) redirect("/login?error=google");
  const next = safeNext(new URL(request.url).searchParams.get("next") ?? undefined);
  const tx = createOauthTransaction(next, env.SESSION_SECRET);
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, tx.cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  logEvent("info", "auth.google.start", {});
  redirect(googleAuthorizeUrl({ origin, clientId: env.GOOGLE_CLIENT_ID!, state: tx.state, challenge: tx.challenge }));
}
