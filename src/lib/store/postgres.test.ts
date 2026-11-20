import { describe, expect, it } from "vitest";
import { loadMigrationFiles, MigrationError, runMigrations } from "@/lib/db/migrate";
import { createPgliteClient } from "@/test/pglite-client";
import { describeSignalRepositoryContract, makeEventDraft, makeStored, TENANT_A } from "./contract";
import { PostgresSignalRepository } from "./postgres";
import { PostgresInvestigationRepository } from "./postgres-investigations";
import { describeCatalogContract } from "./catalog-contract";
import { describeGovernanceContract } from "./governance-contract";
import { describeIntegrationContract } from "./integration-contract";
import { PostgresIntegrationRepository } from "./postgres-integrations";
import { INSPECTED_TABLES } from "./catalog-types";
import { PostgresGovernanceRepository } from "./postgres-governance";
import { PostgresBusinessRecordCatalog, PostgresStoreInspector } from "./postgres-catalog";
import { PostgresBusinessRecordReader, seedBusinessDataset } from "./postgres-records";
import { InMemoryBusinessRecordReader } from "./memory-records";
import { describeInvestigationContract, makeCase } from "./investigation-contract";
import { describeExtractionContract, makeOutcome } from "./extraction-contract";
import { PostgresExtractionRepository } from "./postgres-extractions";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";

const files = loadMigrationFiles("supabase/migrations");

async function migratedClient() {
  const client = await createPgliteClient();
  await runMigrations(client, files);
  return client;
}

describeSignalRepositoryContract("postgres (PGlite)", async () => {
  const client = await migratedClient();
  return { repo: new PostgresSignalRepository(client), close: () => client.close() };
});

const SEEDED_AT = new Date("2026-10-24T06:00:00.000Z");

async function seededClient() {
  const client = await migratedClient();
  await client.query("insert into tenants (id, name) values ($1, 'A')", [TENANT_A]);
  await seedBusinessDataset(client, TENANT_A, syntheticBusinessDataset(SEEDED_AT));
  return client;
}

describeInvestigationContract("postgres (PGlite)", async () => {
  const client = await seededClient();
  return {
    signals: new PostgresSignalRepository(client),
    investigations: new PostgresInvestigationRepository(client),
    reader: new PostgresBusinessRecordReader(client),
    close: () => client.close(),
  };
});

describeExtractionContract("postgres (PGlite)", async () => {
  const client = await migratedClient();
  return { signals: new PostgresSignalRepository(client), extractions: new PostgresExtractionRepository(client), close: () => client.close() };
});

describe("ai_extractions guarantees (PGlite)", () => {
  it("is append-only and rejects inconsistent rows", async () => {
    const client = await migratedClient();
    const signals = new PostgresSignalRepository(client);
    await signals.ensureTenant(TENANT_A, "A");
    await signals.transaction((tx) => tx.insertSignal(makeStored("SIG-1", TENANT_A)));
    const repo = new PostgresExtractionRepository(client);
    await repo.record(TENANT_A, "SIG-1", makeOutcome(), makeEventDraft("SIG-1", "corr-SIG-1", "2026-10-24T09:10:00.000Z", {
      type: "extraction.completed", stage: "extraction", method: { kind: "model", name: "mock:mock-extractor-1" },
    }));
    await expect(client.query("update ai_extractions set status = 'completed'")).rejects.toThrow(/append-only/);
    await expect(client.query("delete from ai_extractions")).rejects.toThrow(/append-only/);
    await expect(client.exec("truncate ai_extractions")).rejects.toThrow(/append-only/);
    // A failed extraction cannot carry fields, and a completed one cannot carry a failure code.
    await expect(repo.record(TENANT_A, "SIG-1", makeOutcome({ status: "timeout", failure: "timeout" }), makeEventDraft("SIG-1", "corr-SIG-1", "2026-10-24T09:11:00.000Z"))).rejects.toThrow();
    await expect(repo.record(TENANT_A, "SIG-1", makeOutcome({ failure: "x" }), makeEventDraft("SIG-1", "corr-SIG-1", "2026-10-24T09:11:00.000Z"))).rejects.toThrow();
    expect(Object.values(await repo.latestForSignals(TENANT_A, ["SIG-1"])).map((x) => x.id)).toEqual(["SIG-1-AI1"]);
    await client.close();
  });
});

describe("business records (PGlite)", () => {
  const stripMeta = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value, (key, v: unknown) => (key === "updatedAt" ? undefined : v)));

  it("returns the same records as the in-memory reader", async () => {
    const client = await seededClient();
    const pg = new PostgresBusinessRecordReader(client);
    const mem = new InMemoryBusinessRecordReader();
    mem.load(TENANT_A, syntheticBusinessDataset(SEEDED_AT), SEEDED_AT.toISOString());
    const window = { from: "2026-10-01", to: "2026-12-31" };
    for (const [a, b] of [
      [pg.purchaseOrder(TENANT_A, "PO-77410"), mem.purchaseOrder(TENANT_A, "PO-77410")],
      [pg.material(TENANT_A, "WL-0420"), mem.material(TENANT_A, "WL-0420")],
      [pg.inventory(TENANT_A, "LN-2210"), mem.inventory(TENANT_A, "LN-2210")],
      [pg.reservations(TENANT_A, "NV-4410", "FAC-1"), mem.reservations(TENANT_A, "NV-4410", "FAC-1")],
      [pg.requirements(TENANT_A, "TR-5502", window), mem.requirements(TENANT_A, "TR-5502", window)],
      [pg.shipmentsForPurchaseOrder(TENANT_A, "PO-77210"), mem.shipmentsForPurchaseOrder(TENANT_A, "PO-77210")],
      [pg.shipment(TENANT_A, "SHP-30871"), mem.shipment(TENANT_A, "SHP-30871")],
      [pg.lotBalances(TENANT_A, "WL-3301"), mem.lotBalances(TENANT_A, "WL-3301")],
    ] as const) {
      expect(stripMeta(await a)).toEqual(stripMeta(await b));
    }
    await client.close();
  });

  it("seeds idempotently and versions refreshed rows", async () => {
    const client = await seededClient();
    const again = await seedBusinessDataset(client, TENANT_A, syntheticBusinessDataset(SEEDED_AT));
    expect(again.inserted).toBe(0);
    expect(again.updated).toBe(0);
    const nextDay = await seedBusinessDataset(client, TENANT_A, syntheticBusinessDataset(new Date("2026-10-25T06:00:00.000Z")), { refresh: true });
    expect(nextDay.inserted).toBe(0);
    expect(nextDay.updated).toBeGreaterThan(0);
    const line = (await new PostgresBusinessRecordReader(client).purchaseOrder(TENANT_A, "PO-77410"))?.lines[0];
    expect(line?.promisedDate).toBe("2026-10-27");
    expect(line?.meta.recordVersion).toBe(2);
    await client.close();
  });

  it("rejects non-synthetic business rows", async () => {
    const client = await seededClient();
    await expect(
      client.query("insert into suppliers (tenant_id, id, name, data_mode) values ($1, 'SUP-X', 'Real Co', 'real')", [TENANT_A]),
    ).rejects.toThrow();
    await client.close();
  });
});

describe("investigation history guarantees (PGlite)", () => {
  it("makes runs and findings append-only and cases undeletable", async () => {
    const client = await seededClient();
    const signals = new PostgresSignalRepository(client);
    const repo = new PostgresInvestigationRepository(client);
    await signals.transaction((tx) => tx.insertSignal(makeStored("SIG-1", TENANT_A)));
    const at = "2026-10-24T09:00:00.000Z";
    await repo.transaction(async (tx) => {
      await tx.insertCase(makeCase("INV-1", TENANT_A));
      await tx.insertRun({
        tenantId: TENANT_A, id: "RUN-1", caseId: "INV-1", runNumber: 1, trigger: "signal", triggerSignalId: "SIG-1",
        ruleVersions: {}, retrieval: { calls: 0, rows: 0, truncated: false, budgetExhausted: false },
        entities: { nodes: [], edges: [] }, startedAt: at, finishedAt: at,
        evidence: [{
          id: "RUN-1-E1", caseId: "INV-1", sourceSystem: "Mailbox (synthetic)", sourceRecordId: "SIG-1", sourceType: "supplier_email",
          sourceTable: "signals", title: "Signal", excerpt: "x", fieldLocation: "label", observedAt: at, sourceReportedAt: null,
          recordVersion: "v1", extractionMethod: "deterministic_rule", verificationStatus: "reported", dataMode: "synthetic",
        }],
        claims: [], unknowns: [], conflicts: [], shortage: null, deliveryRisk: null,
      });
    });
    for (const table of ["investigation_runs", "evidence_items"]) {
      await expect(client.query(`update ${table} set data_mode = 'synthetic'`)).rejects.toThrow(/append-only/);
      await expect(client.query(`delete from ${table}`)).rejects.toThrow(/append-only/);
      await expect(client.exec(`truncate ${table} cascade`)).rejects.toThrow(/append-only/);
    }
    await expect(client.query("delete from cases")).rejects.toThrow(/append-only/);
    await expect(client.query("delete from case_signals")).resolves.toEqual([]);
    expect((await repo.getCase(TENANT_A, "INV-1"))?.latest).toBeNull();
    expect((await repo.getCase(TENANT_A, "INV-1"))?.runs).toHaveLength(1);
    await client.close();
  });
});

describe("migrations and database guarantees (PGlite)", () => {
  it("is idempotent and detects an edited migration", async () => {
    const client = await createPgliteClient();
    const first = await runMigrations(client, files);
    expect(first.applied).toEqual(files.map((f) => f.name));
    const second = await runMigrations(client, files);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(files.map((f) => f.name));
    await expect(
      runMigrations(client, files.map((f) => ({ ...f, sql: `${f.sql}\n-- edited` }))),
    ).rejects.toBeInstanceOf(MigrationError);
    await client.close();
  });

  it("enables row level security with no policies on every table", async () => {
    const client = await migratedClient();
    const tables = await client.query(
      `select c.relname, c.relrowsecurity,
              (select count(*) from pg_policies p where p.tablename = c.relname) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'app_migrations'
        order by c.relname`,
    );
    expect(tables.map((t) => t.relname)).toEqual(
      [
        "action_approvals", "action_executions", "ai_extractions", "case_signals", "cases", "claims", "conflicts",
        "connector_runs", "evidence_items", "impact_calculations", "inventory_balances", "inventory_reservations",
        "investigation_runs", "locations", "materials", "outcome_observations", "production_orders", "production_requirements",
        "proposed_actions", "purchase_order_lines", "purchase_orders", "review_decisions", "shipments", "signal_events",
        "signals", "suppliers", "tenants", "tool_calls", "unknowns", "users",
      ],
    );
    for (const t of tables) {
      expect(t.relrowsecurity).toBe(true);
      expect(Number(t.policies)).toBe(0);
    }
    await client.close();
  });

  it("revokes table privileges from anon and authenticated when those roles exist", async () => {
    const client = await createPgliteClient();
    await client.exec("create role anon; create role authenticated;");
    await runMigrations(client, files);
    const grants = await client.query(
      `select grantee, table_name from information_schema.role_table_grants
        where grantee in ('anon','authenticated') and table_schema = 'public'`,
    );
    expect(grants).toEqual([]);
    await client.close();
  });

  it("makes signal_events append-only", async () => {
    const client = await migratedClient();
    const repo = new PostgresSignalRepository(client);
    await repo.ensureTenant(TENANT_A, "A");
    await repo.transaction(async (tx) => {
      await tx.insertSignal(makeStored("SIG-1", TENANT_A));
      await tx.insertEvents(TENANT_A, [makeEventDraft("SIG-1", "corr-1", "2026-10-24T09:00:00.000Z")]);
    });
    await expect(client.query("update signal_events set status = 'failed'")).rejects.toThrow(/append-only/);
    await expect(client.query("delete from signal_events")).rejects.toThrow(/append-only/);
    await expect(client.exec("truncate signal_events")).rejects.toThrow(/append-only/);
    expect(await repo.listEvents(TENANT_A, { limit: 5 })).toHaveLength(1);
    await client.close();
  });

  it("rejects non-synthetic rows and oversize raw payloads at the database", async () => {
    const client = await migratedClient();
    const repo = new PostgresSignalRepository(client);
    await repo.ensureTenant(TENANT_A, "A");
    const real = { ...makeStored("SIG-1", TENANT_A), dataMode: "real" } as unknown as ReturnType<typeof makeStored>;
    await expect(repo.transaction((tx) => tx.insertSignal(real))).rejects.toThrow();
    const huge = makeStored("SIG-2", TENANT_A, {}, { raw: { padding: "x".repeat(17_000) } });
    await expect(repo.transaction((tx) => tx.insertSignal(huge))).rejects.toThrow();
    await client.close();
  });
});

describeCatalogContract("postgres (PGlite)", async () => {
  const client = await migratedClient();
  return {
    catalog: new PostgresBusinessRecordCatalog(client),
    seed: async (tenantId) => {
      await client.query("insert into tenants (id, name) values ($1, $2) on conflict (id) do nothing", [tenantId, tenantId]);
      await seedBusinessDataset(client, tenantId, syntheticBusinessDataset(SEEDED_AT));
    },
    close: () => client.close(),
  };
});

describeGovernanceContract("postgres (PGlite)", async () => {
  const client = await migratedClient();
  const signals = new PostgresSignalRepository(client);
  const investigations = new PostgresInvestigationRepository(client);
  return {
    governance: new PostgresGovernanceRepository(client),
    ensureTenant: (id) => signals.ensureTenant(id, id),
    seedCase: (tenantId, caseId) => investigations.transaction((tx) => tx.insertCase(makeCase(caseId, tenantId))),
    close: () => client.close(),
  };
});

describeIntegrationContract("postgres (PGlite)", async () => {
  const client = await migratedClient();
  const signals = new PostgresSignalRepository(client);
  return {
    integrations: new PostgresIntegrationRepository(client),
    ensureTenant: (id) => signals.ensureTenant(id, id),
    close: () => client.close(),
  };
});

describe("store inspection (PGlite)", () => {
  it("reports applied migrations, RLS and mutation guards from the database", async () => {
    const client = await migratedClient();
    const inspection = await new PostgresStoreInspector(client).inspect();
    expect(inspection.migrations.map((m) => m.name)).toEqual(files.map((f) => f.name));
    expect(inspection.tables.map((t) => t.table)).toEqual([...INSPECTED_TABLES].sort());
    expect(inspection.tables.every((t) => t.rowLevelSecurity)).toBe(true);
    expect(inspection.tables.find((t) => t.table === "signal_events")?.mutationGuard).toBe("append_only");
    expect(inspection.tables.find((t) => t.table === "ai_extractions")?.mutationGuard).toBe("append_only");
    expect(inspection.tables.find((t) => t.table === "cases")?.mutationGuard).toBe("no_delete");
    expect(inspection.tables.find((t) => t.table === "users")?.mutationGuard).toBe("no_delete");
    expect(inspection.tables.find((t) => t.table === "review_decisions")?.mutationGuard).toBe("append_only");
    expect(inspection.tables.find((t) => t.table === "action_approvals")?.mutationGuard).toBe("append_only");
    expect(inspection.tables.find((t) => t.table === "tool_calls")?.mutationGuard).toBe("append_only");
    expect(inspection.tables.find((t) => t.table === "connector_runs")?.mutationGuard).toBe("append_only");
    await client.close();
  });
});
