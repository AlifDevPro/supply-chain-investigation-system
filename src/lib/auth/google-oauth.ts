import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { GoogleIdentity } from "./register";

export const OAUTH_COOKIE = "sci_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;

const userInfoSchema = z.object({
  sub: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(120),
  email_verified: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  name: z.string().max(80).optional(),
});

export function googleConfigured(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Local http is allowed. Any other origin must be https, so a forged host cannot receive the code. */
export function oauthOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return url.origin;
    return null;
  } catch {
    return null;
  }
}

interface OauthPayload {
  v: 1;
  state: string;
  verifier: string;
  next: string;
  exp: number;
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createOauthTransaction(next: string, secret: string, now = Date.now()): { cookie: string; state: string; challenge: string } {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const payload: OauthPayload = { v: 1, state, verifier, next, exp: Math.floor(now / 1000) + OAUTH_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { cookie: `${encoded}.${sign(encoded, secret)}`, state, challenge };
}

export function readOauthTransaction(cookie: string, secret: string, now = Date.now()): { state: string; verifier: string; next: string } | null {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = sign(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OauthPayload;
    if (payload.v !== 1 || payload.exp * 1000 <= now || !payload.state || !payload.verifier || !payload.next) return null;
    return { state: payload.state, verifier: payload.verifier, next: payload.next };
  } catch {
    return null;
  }
}

export function googleAuthorizeUrl(params: { origin: string; clientId: string; state: string; challenge: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", `${params.origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Exchanges an authorization code. The access token is not returned. */
export async function exchangeGoogleCode(params: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleIdentity> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const tokenRes = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.verifier,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenRes.ok) throw new Error("google_token");
  const token = (await tokenRes.json()) as { access_token?: unknown };
  if (typeof token.access_token !== "string" || token.access_token.length < 1 || token.access_token.length > 4096) {
    throw new Error("google_token");
  }
  const infoRes = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!infoRes.ok) throw new Error("google_userinfo");
  const parsed = userInfoSchema.safeParse(await infoRes.json());
  if (!parsed.success) throw new Error("google_userinfo");
  const verified = parsed.data.email_verified === true || parsed.data.email_verified === "true";
  return { sub: parsed.data.sub, email: parsed.data.email, emailVerified: verified, name: parsed.data.name ?? "" };
}
