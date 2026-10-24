import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SqlClient, SqlQueryable } from "./sql";

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export class MigrationError extends Error {}

export function loadMigrationFiles(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

const checksum = (sql: string) => createHash("sha256").update(sql, "utf8").digest("hex");

/**
 * Applies migrations in filename order, each inside a transaction, recording them in `app_migrations`.
 * Idempotent: an already applied file is skipped. A file edited after being applied fails loudly instead of
 * being silently re-run or ignored.
 */
async function ensureLedger(client: SqlClient): Promise<void> {
  await client.exec(
    `create table if not exists app_migrations (
       name text primary key,
       checksum text not null,
       applied_at timestamptz not null default now()
     )`,
  );
}

type ObjectCheck =
  | { kind: "table"; name: string; rls: boolean }
  | { kind: "sequence" | "index" | "function"; name: string }
  | { kind: "trigger"; table: string; name: string }
  | { kind: "constraint"; table: string; name: string };

/**
 * Objects a migration must have created before it may be adopted (recorded without running it).
 * Only migrations listed here can be adopted.
 */
export const ADOPTABLE_MIGRATIONS: Readonly<Record<string, readonly ObjectCheck[]>> = {
  "0001_signals_and_events.sql": [
    { kind: "table", name: "tenants", rls: true },
    { kind: "table", name: "signals", rls: true },
    { kind: "table", name: "signal_events", rls: true },
    { kind: "sequence", name: "signal_number_seq" },
    { kind: "function", name: "reject_event_mutation" },
    { kind: "trigger", table: "signal_events", name: "signal_events_no_update_delete" },
    { kind: "trigger", table: "signal_events", name: "signal_events_no_truncate" },
    { kind: "constraint", table: "signals", name: "signals_tenant_id_uq" },
    { kind: "constraint", table: "signals", name: "signals_rejected_shape" },
    { kind: "constraint", table: "signal_events", name: "signal_events_signal_fk" },
    { kind: "index", name: "signals_canonical_record_content_uq" },
    { kind: "index", name: "signal_events_sequence_uq" },
    { kind: "index", name: "signal_events_tenant_occurred_idx" },
  ],
};

async function objectExists(tx: SqlQueryable, check: ObjectCheck): Promise<boolean> {
  const one = async (text: string, params: unknown[]) => (await tx.query(text, params)).length > 0;
  switch (check.kind) {
    case "table":
      return one(
        `select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relname = $1 and c.relkind = 'r' and c.relrowsecurity = $2`,
        [check.name, check.rls],
      );
    case "sequence":
    case "index":
      return one(
        `select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relname = $1 and c.relkind = $2`,
        [check.name, check.kind === "sequence" ? "S" : "i"],
      );
    case "function":
      return one(
        `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = current_schema() and p.proname = $1`,
        [check.name],
      );
    case "trigger":
      return one(
        `select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relname = $1 and t.tgname = $2`,
        [check.table, check.name],
      );
    case "constraint":
      return one(
        `select 1 from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relname = $1 and k.conname = $2`,
        [check.table, check.name],
      );
  }
}

const describeCheck = (c: ObjectCheck) =>
  c.kind === "trigger" || c.kind === "constraint" ? `${c.kind} ${c.table}.${c.name}` : `${c.kind} ${c.name}${c.kind === "table" && c.rls ? " (RLS on)" : ""}`;

/**
 * Records an already-present migration in the ledger without running it, for a database where the SQL was
 * applied by hand. Refuses unless every expected object exists. Returns false if it was already recorded.
 */
export async function adoptExistingMigration(client: SqlClient, file: MigrationFile): Promise<boolean> {
  const checks = ADOPTABLE_MIGRATIONS[file.name];
  if (!checks) throw new MigrationError(`Migration ${file.name} cannot be adopted.`);
  await ensureLedger(client);
  const sum = checksum(file.sql);
  return client.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", ["app_migrations"]);
    const existing = (await tx.query("select checksum from app_migrations where name = $1", [file.name]))[0];
    if (existing) {
      if (existing.checksum !== sum) throw new MigrationError(`Migration ${file.name} was modified after it was applied.`);
      return false;
    }
    const missing: string[] = [];
    for (const check of checks) if (!(await objectExists(tx, check))) missing.push(describeCheck(check));
    if (missing.length) {
      throw new MigrationError(`Cannot adopt ${file.name}; missing: ${missing.join(", ")}.`);
    }
    await tx.query("insert into app_migrations (name, checksum) values ($1, $2)", [file.name, sum]);
    return true;
  });
}

export async function runMigrations(client: SqlClient, files: readonly MigrationFile[]): Promise<MigrationResult> {
  await ensureLedger(client);
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const file of files) {
    const sum = checksum(file.sql);
    await client.transaction(async (tx) => {
      // Serialize concurrent runners on the same database.
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", ["app_migrations"]);
      const existing = await tx.query("select checksum from app_migrations where name = $1", [file.name]);
      const row = existing[0];
      if (row) {
        if (row.checksum !== sum) {
          throw new MigrationError(`Migration ${file.name} was modified after it was applied.`);
        }
        result.skipped.push(file.name);
        return;
      }
      await tx.exec(file.sql);
      await tx.query("insert into app_migrations (name, checksum) values ($1, $2)", [file.name, sum]);
      result.applied.push(file.name);
    });
  }
  return result;
}
