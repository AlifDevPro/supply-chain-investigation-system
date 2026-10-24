import { describe, expect, it } from "vitest";
import { createPgliteClient } from "@/test/pglite-client";
import { adoptExistingMigration, loadMigrationFiles, MigrationError, runMigrations } from "./migrate";

const files = loadMigrationFiles("supabase/migrations");
const first = files[0]!;

describe("adoptExistingMigration (PGlite)", () => {
  it("records a hand-applied migration after verifying its objects, then the runner skips it", async () => {
    const client = await createPgliteClient();
    await client.exec(first.sql);
    await expect(runMigrations(client, [first])).rejects.toMatchObject({ code: "42P07" });

    expect(await adoptExistingMigration(client, first)).toBe(true);
    expect(await adoptExistingMigration(client, first)).toBe(false);
    const result = await runMigrations(client, files);
    expect(result.skipped).toContain(first.name);
    expect(result.applied).toEqual(files.slice(1).map((f) => f.name));
    await client.close();
  });

  it("refuses when an expected object is missing", async () => {
    const client = await createPgliteClient();
    await client.exec(first.sql);
    await client.exec("drop trigger signal_events_no_truncate on signal_events");
    await expect(adoptExistingMigration(client, first)).rejects.toThrow(/missing: trigger signal_events.signal_events_no_truncate/);
    await client.close();
  });

  it("refuses on an empty database and for migrations that are not adoptable", async () => {
    const client = await createPgliteClient();
    await expect(adoptExistingMigration(client, first)).rejects.toBeInstanceOf(MigrationError);
    await expect(adoptExistingMigration(client, { name: "9999_other.sql", sql: "" })).rejects.toBeInstanceOf(MigrationError);
    await client.close();
  });
});
