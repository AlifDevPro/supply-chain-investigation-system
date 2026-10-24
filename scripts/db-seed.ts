/**
 * Seeds SYNTHETIC data into DATABASE_URL:
 *  1. business records (suppliers, materials, orders, inventory, shipments), idempotently;
 *  2. ~11 labelled submissions through the real pipeline, each investigated like a live submission.
 *
 * Run: npm run db:seed
 *   --refresh-records  update changed business rows (dates are relative to today) and bump record_version
 *   --force            replay every submission even if the tenant already has signals
 * When the tenant already has signals, only submissions whose source record id is not stored yet are sent.
 */
import { createAiConfig } from "@/lib/ai/config";
import { createPostgresClient } from "@/lib/db/postgres-client";
import { parseEnv } from "@/lib/env";
import { SEED_SUBMISSIONS, seedSyntheticSignals } from "@/lib/ingestion/seed";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { PostgresSignalRepository } from "@/lib/store/postgres";
import { PostgresExtractionRepository } from "@/lib/store/postgres-extractions";
import { PostgresInvestigationRepository } from "@/lib/store/postgres-investigations";
import { PostgresGovernanceRepository } from "@/lib/store/postgres-governance";
import { PostgresBusinessRecordReader, seedBusinessDataset } from "@/lib/store/postgres-records";
import { demoPasswordsFromEnv, seedDemoUsers } from "@/lib/auth/seed-users";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const tenantId = process.env.DEMO_TENANT_ID?.trim() || "tenant-demo";
  const force = process.argv.includes("--force");
  const refresh = process.argv.includes("--refresh-records");
  // AI extraction for seeded signals follows AI_PROVIDER (off by default); it never changes cases.
  const ai = createAiConfig(parseEnv(process.env));
  const client = createPostgresClient(url, { max: 1 });
  const repo = new PostgresSignalRepository(client);
  const investigations = new PostgresInvestigationRepository(client);
  const governance = new PostgresGovernanceRepository(client);
  try {
    await repo.ensureTenant(tenantId, "Demo tenant (synthetic)");
    const seededUsers = await seedDemoUsers(governance, tenantId, demoPasswordsFromEnv());
    console.log(
      seededUsers.length > 0
        ? `Demo users seeded (hashes only): ${seededUsers.join(", ")}.`
        : "Demo users skipped (set DEMO_*_PASSWORD to seed sign-in accounts).",
    );
    const records = await seedBusinessDataset(client, tenantId, syntheticBusinessDataset(new Date()), { refresh });
    console.log(
      `Business records (synthetic): ${records.inserted} inserted, ${records.updated} updated, ${records.unchanged} unchanged.`,
    );

    const existing = await repo.listSignals(tenantId, { limit: 1 });
    let include: ((s: (typeof SEED_SUBMISSIONS)[number]) => boolean) | undefined;
    if (existing.length > 0 && !force) {
      const stored = new Set(
        (await client.query("select source_record_id from signals where tenant_id = $1 and source_record_id is not null", [tenantId]))
          .map((r) => String(r.source_record_id)),
      );
      include = (s) => {
        const id = (s.body as { sourceRecordId?: unknown }).sourceRecordId;
        return typeof id === "string" && !stored.has(id);
      };
      console.log(`Tenant ${tenantId} already has signals; sending only submissions whose record id is not stored yet.`);
    }
    const results = await seedSyntheticSignals(
      tenantId,
      {
        repo,
        caseIndex: { openCases: () => investigations.openCaseReferences(tenantId) },
        investigation: {
          signals: repo,
          investigations,
          reader: new PostgresBusinessRecordReader(client),
          extraction: { signals: repo, extractions: new PostgresExtractionRepository(client), ai },
          governance,
        },
      },
      { include },
    );
    for (const r of results) {
      console.log(
        `${r.signalId}  ${r.kind.padEnd(9)}  ${(r.investigation ?? "-").padEnd(8)} ${(r.caseId ?? "").padEnd(9)} ` +
          `ai:${(r.extraction ?? "-").padEnd(14)} ${r.note}`,
      );
    }
    console.log(`Seeded ${results.length} synthetic submissions for tenant ${tenantId}.`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string } | null)?.code ?? "unknown";
  const hint = code === "42P01" ? " Tables are missing: run `npm run db:migrate` first." : "";
  console.error(`Seed failed (${error instanceof Error ? error.constructor.name : "Error"}, code ${code}).${hint}`);
  process.exit(1);
});
