import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "./password";
import type { GovernanceRepository, StoredUser } from "@/lib/store/governance-types";
import { UniqueViolationError } from "@/lib/store/types";

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists. Sign in instead.");
    this.name = "EmailTakenError";
  }
}

export class GoogleAccountError extends Error {
  constructor(readonly reason: "unverified" | "disabled" | "conflict") {
    super(reason);
    this.name = "GoogleAccountError";
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

function visible(value: string): string {
  return [...value].filter((ch) => ch >= " " && ch !== "\u007f").join("").trim().slice(0, 80);
}

function displayName(name: string, email: string): string {
  return visible(name) || visible(email.split("@")[0] ?? "") || "Reviewer";
}

/** Creates a reviewer on the server tenant. Role and tenant are not taken from the caller. */
export async function registerPasswordUser(params: {
  tenantId: string;
  email: string;
  displayName: string;
  password: string;
  governance: GovernanceRepository;
  now?: Date;
}): Promise<StoredUser> {
  const email = params.email.trim().toLowerCase();
  const now = (params.now ?? new Date()).toISOString();
  const existing = await params.governance.getUserByEmail(params.tenantId, email);
  if (existing) throw new EmailTakenError();
  const user: StoredUser = {
    tenantId: params.tenantId,
    id: `USR-${randomBytes(8).toString("hex")}`,
    email,
    displayName: displayName(params.displayName, email),
    role: "reviewer",
    passwordHash: await hashPassword(params.password),
    googleSub: null,
    disabledAt: null,
    createdAt: now,
    dataMode: "synthetic",
  };
  try {
    await params.governance.upsertUser(user);
  } catch (error) {
    if (error instanceof UniqueViolationError) throw new EmailTakenError();
    throw error;
  }
  return user;
}

/**
 * Finds or creates the user for a verified Google identity.
 * An existing email keeps its role. A new account is a reviewer with no password.
 */
export async function accountFromGoogle(params: {
  tenantId: string;
  identity: GoogleIdentity;
  governance: GovernanceRepository;
  now?: Date;
}): Promise<StoredUser> {
  if (!params.identity.emailVerified) throw new GoogleAccountError("unverified");
  const email = params.identity.email.trim().toLowerCase();
  const sub = params.identity.sub.trim();
  const bySub = await params.governance.getUserByGoogleSub(params.tenantId, sub);
  if (bySub) {
    if (bySub.disabledAt) throw new GoogleAccountError("disabled");
    return bySub;
  }
  const byEmail = await params.governance.getUserByEmail(params.tenantId, email);
  if (byEmail) {
    if (byEmail.disabledAt) throw new GoogleAccountError("disabled");
    if (byEmail.googleSub && byEmail.googleSub !== sub) throw new GoogleAccountError("conflict");
    await params.governance.linkGoogleSub(params.tenantId, byEmail.id, sub);
    return { ...byEmail, googleSub: sub };
  }
  const now = (params.now ?? new Date()).toISOString();
  const user: StoredUser = {
    tenantId: params.tenantId,
    id: `USR-${createHash("sha256").update(sub).digest("hex").slice(0, 16)}`,
    email,
    displayName: displayName(params.identity.name, email),
    role: "reviewer",
    passwordHash: null,
    googleSub: sub,
    disabledAt: null,
    createdAt: now,
    dataMode: "synthetic",
  };
  try {
    await params.governance.upsertUser(user);
  } catch (error) {
    if (error instanceof UniqueViolationError) throw new GoogleAccountError("conflict");
    throw error;
  }
  return user;
}
