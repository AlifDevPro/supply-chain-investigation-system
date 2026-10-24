"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/safe-next";
import { clearSessionCookie, writeSessionCookie } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getGovernance, getLoginLimiter } from "@/lib/runtime";
import type { LoginState } from "./state";

const FAIL = "Email or password is incorrect.";
const inputSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = inputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { status: "error", message: FAIL };
  if (!getEnv().SESSION_SECRET) return { status: "error", message: "Sign-in is not configured." };
  const limited = getLoginLimiter().check("login");
  if (!limited.allowed) return { status: "error", message: "Too many sign-in attempts. Wait a minute and try again." };
  try {
    const store = await getGovernance();
    if (!store) return { status: "error", message: FAIL };
    const user = await store.governance.getUserByEmail(store.tenantId, parsed.data.email.toLowerCase());
    if (!user || user.disabledAt) {
      logEvent("info", "auth.login.failed", { reason: "unknown_or_disabled" });
      return { status: "error", message: FAIL };
    }
    if (!user.passwordHash) {
      logEvent("info", "auth.login.failed", { reason: "mismatch" });
      return { status: "error", message: FAIL };
    }
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      logEvent("info", "auth.login.failed", { reason: "mismatch" });
      return { status: "error", message: FAIL };
    }
    await writeSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
    });
    logEvent("info", "auth.login", { userId: user.id, role: user.role });
    redirect(safeNext(parsed.data.next));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    logEvent("error", "auth.login.failed", { reason: "store" });
    return { status: "error", message: FAIL };
  }
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
