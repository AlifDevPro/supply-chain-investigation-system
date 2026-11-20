import { createPostgresClient } from "@/lib/db/postgres-client";
import { PostgresGovernanceRepository } from "@/lib/store/postgres-governance";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/env";
import { signSession, verifySessionToken } from "@/lib/auth/session-crypto";

async function main() {
  const env = getEnv();
  console.log("DATA_SOURCE", env.DATA_SOURCE, "SESSION", Boolean(env.SESSION_SECRET));
  const client = createPostgresClient(env.DATABASE_URL!, { max: 1 });
  const gov = new PostgresGovernanceRepository(client);
  try {
    const user = await gov.getUserByEmail("tenant-demo", "reviewer@demo.local");
    console.log("user", user && {
      id: user.id,
      role: user.role,
      hasHash: Boolean(user.passwordHash),
      google: user.googleSub,
      hashPrefix: user.passwordHash?.slice(0, 24),
    });
    const pw = process.env.DEMO_REVIEWER_PASSWORD ?? "";
    const ok = user?.passwordHash ? await verifyPassword(pw, user.passwordHash) : false;
    console.log("passwordOk", ok, "pwLen", pw.length);
    if (user && env.SESSION_SECRET) {
      const token = signSession(
        { userId: user.id, tenantId: user.tenantId, role: user.role, displayName: user.displayName, email: user.email },
        env.SESSION_SECRET,
      );
      console.log("sessionRoundTrip", Boolean(verifySessionToken(token, env.SESSION_SECRET)));
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
