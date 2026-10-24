import { createHmac, timingSafeEqual } from "node:crypto";
import { isRole, type Role } from "./roles";

export const SESSION_COOKIE = "sci_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionUser {
  userId: string;
  tenantId: string;
  role: Role;
  displayName: string;
  email: string;
}

interface Payload {
  v: 1;
  sub: string;
  tid: string;
  role: Role;
  name: string;
  email: string;
  exp: number;
}

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function signSession(user: SessionUser, secret: string, now = Date.now()): string {
  const payload: Payload = {
    v: 1,
    sub: user.userId,
    tid: user.tenantId,
    role: user.role,
    name: user.displayName,
    email: user.email,
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionUser | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    if (payload.v !== 1 || typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
    if (!isRole(payload.role) || !payload.sub || !payload.tid || !payload.name || !payload.email) return null;
    return { userId: payload.sub, tenantId: payload.tid, role: payload.role, displayName: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
