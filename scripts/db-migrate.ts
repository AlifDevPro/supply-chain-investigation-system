/**
 * Applies supabase/migrations/*.sql to DATABASE_URL. Idempotent. Run: npm run db:migrate
 * `npm run db:migrate -- --adopt-existing` first records migrations whose objects already exist (applied by
 * hand, e.g. in the Supabase SQL editor) after verifying every expected object; then applies the rest.
 * Prints file names and counts only; never the connection string.
 */
import path from "node:path";
import { ADOPTABLE_MIGRATIONS, adoptExistingMigration, loadMigrationFiles, runMigrations } from "@/lib/db/migrate";
import { createPostgresClient } from "@/lib/db/postgres-client";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const adopt = process.argv.includes("--adopt-existing");
  const client = createPostgresClient(url, { max: 1 });
  try {
    const files = loadMigrationFiles(path.resolve("supabase/migrations"));
    if (adopt) {
      for (const file of files.filter((f) => f.name in ADOPTABLE_MIGRATIONS)) {
        const adopted = await adoptExistingMigration(client, file);
        console.log(adopted ? `Adopted (verified, not re-run): ${file.name}` : `Already recorded: ${file.name}`);
      }
    }
    const result = await runMigrations(client, files);
    console.log(`Applied: ${result.applied.length ? result.applied.join(", ") : "none"}`);
    console.log(`Already applied: ${result.skipped.length ? result.skipped.join(", ") : "none"}`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  // Driver errors can include host names; print only the class and the SQLSTATE-style code.
  const code = (error as { code?: string } | null)?.code ?? "unknown";
  console.error(`Migration failed (${error instanceof Error ? error.constructor.name : "Error"}, code ${code}).`);
  if (error instanceof Error && error.constructor.name === "MigrationError") console.error(error.message);
  if (code === "42P07") console.error("Objects already exist. If 0001 was applied by hand, run: npm run db:migrate -- --adopt-existing");
  process.exit(1);
});
