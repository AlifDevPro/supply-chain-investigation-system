import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySessionToken,
  type SessionUser,
} from "./session-crypto";

export { SESSION_COOKIE, signSession, verifySessionToken, sessionCookieOptions };
export type { SessionUser };

export class SessionConfigError extends Error {}
export class SessionError extends Error {}

export function sessionSecret(): string {
  const secret = getEnv().SESSION_SECRET;
  if (!secret || secret.length < 32) throw new SessionConfigError("SESSION_SECRET is not configured.");
  return secret;
}

export async function readSession(): Promise<SessionUser | null> {
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return null;
  }
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifySessionToken(raw, secret);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) throw new SessionError("Sign in required.");
  return user;
}

export async function writeSessionCookie(user: SessionUser): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user, sessionSecret()), sessionCookieOptions(process.env.NODE_ENV === "production"));
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(process.env.NODE_ENV === "production"), maxAge: 0 });
}
