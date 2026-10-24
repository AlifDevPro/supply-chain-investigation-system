"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { EmailTakenError, registerPasswordUser } from "@/lib/auth/register";
import { safeNext } from "@/lib/auth/safe-next";
import { writeSessionCookie } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getGovernance, getSignupLimiter } from "@/lib/runtime";
import type { SignupState } from "./state";

const inputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(200),
  confirm: z.string().min(8).max(200),
  next: z.string().optional(),
});

export async function signup(_previous: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = inputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { status: "error", message: "Check the name, email and password. Passwords need at least 8 characters." };
  if (parsed.data.password !== parsed.data.confirm) return { status: "error", message: "The passwords do not match." };
  if (!getEnv().SESSION_SECRET) return { status: "error", message: "Sign-in is not configured." };
  if (!getSignupLimiter().check("signup").allowed) {
    return { status: "error", message: "Too many account attempts. Wait a minute and try again." };
  }
  try {
    const store = await getGovernance();
    if (!store) return { status: "error", message: "Accounts cannot be created in this mode." };
    const user = await registerPasswordUser({
      tenantId: store.tenantId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      governance: store.governance,
    });
    await writeSessionCookie({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
    });
    logEvent("info", "auth.signup", { userId: user.id, role: user.role });
    redirect(safeNext(parsed.data.next));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof EmailTakenError) return { status: "error", message: error.message };
    logEvent("error", "auth.signup.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The account could not be created." };
  }
}
