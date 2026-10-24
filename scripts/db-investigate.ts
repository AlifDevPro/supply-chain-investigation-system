/**
 * Investigates stored SYNTHETIC signals that have no case yet (oldest first), using the same rules as live
 * ingestion. Held (uncertain) signals stay held. Safe to re-run: linked signals are skipped.
 * Run: npm run db:investigate -- --backfill
 */
import { createPostgresClient } from "@/lib/db/postgres-client";
import { backfillInvestigations } from "@/lib/investigation/run";
import { PostgresSignalRepository } from "@/lib/store/postgres";
import { PostgresInvestigationRepository } from "@/lib/store/postgres-investigations";
import { PostgresBusinessRecordReader } from "@/lib/store/postgres-records";

async function main() {
  if (!process.argv.includes("--backfill")) {
    console.error("Usage: npm run db:investigate -- --backfill");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const tenantId = process.env.DEMO_TENANT_ID?.trim() || "tenant-demo";
  const client = createPostgresClient(url, { max: 1 });
  try {
    const summary = await backfillInvestigations(tenantId, {
      signals: new PostgresSignalRepository(client),
      investigations: new PostgresInvestigationRepository(client),
      reader: new PostgresBusinessRecordReader(client),
    });
    const counts = Object.entries(summary.byStatus).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`Examined ${summary.examined} unlinked signal(s) for tenant ${tenantId}: ${counts}.`);
    if (summary.byStatus.failed > 0) {
      console.log("Some investigations failed; see the failed evidence.retrieved events in Live Activity.");
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string } | null)?.code ?? "unknown";
  const hint = code === "42P01" ? " Tables are missing: run `npm run db:migrate` first." : "";
  console.error(`Backfill failed (${error instanceof Error ? error.constructor.name : "Error"}, code ${code}).${hint}`);
  process.exit(1);
});
