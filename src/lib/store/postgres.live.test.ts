import { randomBytes } from "node:crypto";
import { describe, it } from "vitest";
import { createPostgresClient } from "@/lib/db/postgres-client";
import { loadMigrationFiles, runMigrations } from "@/lib/db/migrate";
import { describeSignalRepositoryContract } from "./contract";
import { PostgresSignalRepository } from "./postgres";

/**
 * Runs the same contract against a real Postgres (for example a Supabase project with synthetic data),
 * inside a throwaway schema that is dropped afterwards. Skipped unless TEST_DATABASE_URL is set.
 */
const url = process.env.TEST_DATABASE_URL;

if (url) {
  describeSignalRepositoryContract("postgres (TEST_DATABASE_URL, throwaway schema)", async () => {
    const schema = `test_${randomBytes(6).toString("hex")}`;
    const admin = createPostgresClient(url, { max: 1 });
    await admin.exec(`create schema ${schema}`);
    const client = createPostgresClient(url, { searchPath: schema, max: 2 });
    await runMigrations(client, loadMigrationFiles("supabase/migrations"));
    return {
      repo: new PostgresSignalRepository(client),
      close: async () => {
        await client.close();
        await admin.exec(`drop schema ${schema} cascade`);
        await admin.close();
      },
    };
  });
} else {
  describe("postgres contract (TEST_DATABASE_URL)", () => {
    it.skip("skipped: set TEST_DATABASE_URL to run against a real database", () => {});
  });
}
