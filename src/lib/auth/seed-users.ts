import { hashPassword } from "./password";
import type { Role } from "./roles";
import type { GovernanceRepository, StoredUser } from "@/lib/store/governance-types";

export const DEMO_USERS: ReadonlyArray<{ id: string; email: string; displayName: string; role: Role; envKey: string }> = [
  { id: "USR-REVIEWER", email: "reviewer@demo.local", displayName: "Demo reviewer", role: "reviewer", envKey: "DEMO_REVIEWER_PASSWORD" },
  { id: "USR-PROCUREMENT", email: "procurement@demo.local", displayName: "Demo procurement", role: "procurement", envKey: "DEMO_PROCUREMENT_PASSWORD" },
  { id: "USR-MANAGER", email: "manager@demo.local", displayName: "Demo manager", role: "manager", envKey: "DEMO_MANAGER_PASSWORD" },
];

export type DemoPasswords = Partial<Record<"reviewer" | "procurement" | "manager", string>>;

export function demoPasswordsFromEnv(source: Record<string, string | undefined> = process.env): DemoPasswords {
  const take = (key: string) => {
    const v = source[key]?.trim();
    return v && v.length >= 8 ? v : undefined;
  };
  return {
    reviewer: take("DEMO_REVIEWER_PASSWORD"),
    procurement: take("DEMO_PROCUREMENT_PASSWORD"),
    manager: take("DEMO_MANAGER_PASSWORD"),
  };
}

/** Upserts demo users whose passwords are present. Stores hashes only. */
export async function seedDemoUsers(
  governance: GovernanceRepository,
  tenantId: string,
  passwords: DemoPasswords,
  now = new Date(),
): Promise<string[]> {
  const seeded: string[] = [];
  for (const spec of DEMO_USERS) {
    const password = passwords[spec.role];
    if (!password) continue;
    const existing = await governance.getUserById(tenantId, spec.id);
    const row: StoredUser = {
      tenantId,
      id: spec.id,
      email: spec.email,
      displayName: spec.displayName,
      role: spec.role,
      passwordHash: await hashPassword(password),
      googleSub: existing?.googleSub ?? null,
      disabledAt: null,
      createdAt: existing?.createdAt ?? now.toISOString(),
      dataMode: "synthetic",
    };
    await governance.upsertUser(row);
    seeded.push(spec.email);
  }
  return seeded;
}
