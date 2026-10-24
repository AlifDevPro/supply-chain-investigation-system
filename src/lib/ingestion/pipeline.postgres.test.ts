import { describe, expect, it } from "vitest";
import { fixtureCaseReferenceIndex } from "@/fixtures/case-references";
import { loadMigrationFiles, runMigrations } from "@/lib/db/migrate";
import { PostgresSignalRepository } from "@/lib/store/postgres";
import { createPgliteClient } from "@/test/pglite-client";
import { processSignal } from "./pipeline";
import { makeRaw } from "./test-helpers";

const TENANT = "tenant-demo";

/** The same pipeline over real Postgres semantics (migrations, constraints, transactions) via PGlite. */
describe("processSignal on Postgres (PGlite)", () => {
  it("persists accepted, held, duplicate and rejected outcomes with their events", async () => {
    const client = await createPgliteClient();
    await runMigrations(client, loadMigrationFiles("supabase/migrations"));
    const repo = new PostgresSignalRepository(client);
    await repo.ensureTenant(TENANT, "Demo (synthetic)");
    const deps = { repo, caseIndex: fixtureCaseReferenceIndex };

    const raw = makeRaw({ sourceRecordId: "msg-1", quantity: { value: 100, unit: "m" } });
    const first = await processSignal(TENANT, raw, deps);
    const resend = await processSignal(TENANT, raw, deps);
    const revision = await processSignal(TENANT, makeRaw({ sourceRecordId: "msg-1", quantity: { value: 100, unit: "m" }, excerpt: "changed" }), deps);
    const uncertain = await processSignal(TENANT, makeRaw({ label: "Possible schedule change", references: {}, quantity: undefined }), deps);
    const rejected = await processSignal(TENANT, '{"nope":true}', deps);

    expect([first.kind, resend.kind, revision.kind, uncertain.kind, rejected.kind]).toEqual([
      "accepted", "duplicate", "accepted", "accepted", "rejected",
    ]);
    const signals = await repo.listSignals(TENANT, { limit: 20 });
    expect(signals.map((s) => s.processingStatus).sort()).toEqual(["duplicate", "held_for_review", "held_for_review", "rejected", "triaged"]);
    const events = await repo.listEvents(TENANT, { limit: 100 });
    expect(events.filter((e) => e.type === "signal.received")).toHaveLength(5);
    expect(events.filter((e) => e.type === "signal.held_for_review")).toHaveLength(2);
    expect(events.filter((e) => e.type === "triage.completed")).toHaveLength(3);
    expect(events.find((e) => e.type === "signal.validated" && e.status === "failed")?.errorClass).toBe("validation_error");
    if (resend.kind === "duplicate" && first.kind === "accepted") expect(resend.dedupe.duplicateOf).toBe(first.signalId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => processSignal(TENANT, makeRaw({ sourceRecordId: "msg-race", label: "Delay notice race" }), deps)),
    );
    expect(results.filter((r) => r.kind === "accepted")).toHaveLength(1);
    await client.close();
  });
});
