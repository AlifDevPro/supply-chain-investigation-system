import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryExtractionRepository, InMemoryInvestigationRepository, InMemorySignalRepository, MemoryDb } from "@/lib/store/memory";
import { MOCK_AI } from "@/test/memory-runtime";
import { seededReader } from "@/lib/investigation/test-helpers";
import type { SignalRepository } from "@/lib/store/types";
import { handleIngest, keysMatch, type IngestDeps } from "./http";
import { FixedWindowRateLimiter } from "./rate-limit";
import { makeRaw } from "./test-helpers";

const KEY = "test-key-0123456789abcdef0123456789";
const TENANT = "tenant-demo";
let repo: InMemorySignalRepository;
let deps: IngestDeps;
let store: (r: SignalRepository) => Awaited<ReturnType<IngestDeps["getStore"]>>;

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/signals", {
    method: "POST",
    body,
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", ...headers },
  });
}

beforeEach(async () => {
  const db = new MemoryDb();
  repo = new InMemorySignalRepository(db);
  const investigations = new InMemoryInvestigationRepository(db);
  const reader = seededReader(TENANT);
  const extractions = new InMemoryExtractionRepository(db);
  await repo.ensureTenant(TENANT, "Demo");
  store = (r) => ({
    repo: r,
    caseIndex: { openCases: () => investigations.openCaseReferences(TENANT) },
    investigation: { signals: r, investigations, reader, extraction: { signals: r, extractions, ai: MOCK_AI } },
  });
  deps = {
    apiKey: KEY,
    tenantId: TENANT,
    getStore: async () => store(repo),
    limiter: new FixedWindowRateLimiter(30, 60_000),
    authFailureLimiter: new FixedWindowRateLimiter(60, 60_000),
  };
});

const relevant = () => makeRaw({ sourceRecordId: "msg-1", quantity: { value: 100, unit: "m" } });

describe("POST /api/signals", () => {
  it("201 for a new signal with the triage result", async () => {
    const res = await handleIngest(post(relevant()), deps);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "triaged", dedupe: { status: "unique" }, triage: { outcome: "relevant" }, requiresReview: false });
    expect(body.signalId).toMatch(/^SIG-/);
    // The default test payload names a PO that is not in the seeded records: a case is still created and
    // the missing record is an explicit unknown.
    expect(body).toMatchObject({ investigation: "created", caseId: "INV-3001", extraction: "completed" });
  });

  it("returns the existing case for a related signal and skipped for duplicates", async () => {
    await handleIngest(post(relevant()), deps);
    const related = await (await handleIngest(post(makeRaw({ sourceRecordId: "msg-2", label: "PO-88001 still delayed four days", quantity: { value: 100, unit: "m" } })), deps)).json();
    expect(related).toMatchObject({ investigation: "updated", caseId: "INV-3001" });
    const dup = await (await handleIngest(post(relevant()), deps)).json();
    expect(dup).toMatchObject({ investigation: "skipped", caseId: null, extraction: "skipped" });
  });

  it("200 with duplicateOf for an exact resend", async () => {
    const first = await (await handleIngest(post(relevant()), deps)).json();
    const res = await handleIngest(post(relevant()), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "duplicate", dedupe: { status: "duplicate", duplicateOf: first.signalId }, triage: null });
  });

  it("reports held_for_review for a revision", async () => {
    await handleIngest(post(relevant()), deps);
    const res = await handleIngest(post(makeRaw({ sourceRecordId: "msg-1", quantity: { value: 100, unit: "m" }, excerpt: "changed" })), deps);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "held_for_review", requiresReview: true });
  });

  it("401 without or with a wrong key, with no hint about the right one", async () => {
    const none = await handleIngest(new Request("http://x/api/signals", { method: "POST", body: relevant(), headers: { "content-type": "application/json" } }), deps);
    expect(none.status).toBe(401);
    const wrong = await handleIngest(post(relevant(), { authorization: "Bearer wrong" }), deps);
    expect(wrong.status).toBe(401);
    const text = JSON.stringify(await wrong.json());
    expect(text).not.toContain(KEY);
    expect(await repo.listSignals(TENANT, { limit: 5 })).toEqual([]);
  });

  it("503 ingestion_disabled when no key is configured (fails closed)", async () => {
    const res = await handleIngest(post(relevant()), { ...deps, apiKey: undefined });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("ingestion_disabled");
  });

  it("503 ingestion_disabled when no store is configured", async () => {
    const res = await handleIngest(post(relevant()), { ...deps, getStore: async () => null });
    expect(res.status).toBe(503);
  });

  it("415 for a non-JSON content type", async () => {
    const res = await handleIngest(post(relevant(), { "content-type": "text/plain" }), deps);
    expect(res.status).toBe(415);
  });

  it("413 for an oversize body, by header and by streamed size", async () => {
    const big = JSON.stringify({ padding: "x".repeat(20_000) });
    expect((await handleIngest(post(big), deps)).status).toBe(413);
    const lying = post(big, { "content-length": "10" });
    expect((await handleIngest(lying, deps)).status).toBe(413);
  });

  it("400 for invalid JSON (and stores a rejected record)", async () => {
    const res = await handleIngest(post("{ SECRET-BODY"), deps);
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SECRET-BODY");
    expect((await repo.listSignals(TENANT, { limit: 5 }))[0]?.processingStatus).toBe("rejected");
  });

  it("422 with field paths and codes but never values or stack traces", async () => {
    const res = await handleIngest(post(JSON.stringify({ sourceType: "supplier_email", sourceSystem: "s", label: "", dataMode: "real", note: "LEAK-ME" })), deps);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues).toEqual(expect.arrayContaining([{ path: "label", code: "too_small" }, { path: "note", code: "unrecognized_key" }]));
    const text = JSON.stringify(body);
    expect(text).not.toContain("LEAK-ME");
    expect(text).not.toMatch(/stack|at .*\(|SELECT|postgres/i);
  });

  it("ignores tenant and role fields smuggled in headers or body (body is rejected as unknown key)", async () => {
    const res = await handleIngest(post(JSON.stringify({ ...JSON.parse(relevant()), tenantId: "tenant-other" }), { "x-tenant-id": "tenant-other" }), deps);
    expect(res.status).toBe(422);
    expect(await repo.listSignals("tenant-other", { limit: 5 })).toEqual([]);
  });

  it("stores accepted signals under the server-configured tenant only", async () => {
    await repo.ensureTenant("tenant-other", "Other");
    await handleIngest(post(relevant(), { "x-tenant-id": "tenant-other" }), deps);
    expect(await repo.listSignals(TENANT, { limit: 5 })).toHaveLength(1);
    expect(await repo.listSignals("tenant-other", { limit: 5 })).toHaveLength(0);
  });

  it("429 with Retry-After once the per-key limit is exceeded", async () => {
    deps.limiter = new FixedWindowRateLimiter(2, 60_000);
    await handleIngest(post(relevant()), deps);
    await handleIngest(post(relevant()), deps);
    const res = await handleIngest(post(relevant()), deps);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("429 for repeated failed authentication, without affecting the valid key", async () => {
    deps.authFailureLimiter = new FixedWindowRateLimiter(2, 60_000);
    const bad = () => handleIngest(post(relevant(), { authorization: "Bearer nope" }), deps);
    expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(429);
    expect((await handleIngest(post(relevant()), deps)).status).toBe(201);
  });

  it("503 store_unavailable without leaking internals when persistence fails, and stores nothing", async () => {
    const broken: SignalRepository = Object.assign(Object.create(repo) as SignalRepository, {
      transaction: async () => {
        throw Object.assign(new Error('connection to "db.secret-host.supabase.co" failed password=hunter2'), { code: "ECONNREFUSED" });
      },
    });
    const res = await handleIngest(post(relevant()), { ...deps, getStore: async () => store(broken) });
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("store_unavailable");
    expect(text).not.toMatch(/secret-host|hunter2|ECONNREFUSED/);
    expect(await repo.listSignals(TENANT, { limit: 5 })).toEqual([]);
  });

  it("503 when the store cannot even be reached", async () => {
    const res = await handleIngest(post(relevant()), { ...deps, getStore: async () => { throw new Error("password=hunter2"); } });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });
});

describe("keysMatch", () => {
  it("compares in constant time over digests and handles different lengths", () => {
    expect(keysMatch(KEY, KEY)).toBe(true);
    expect(keysMatch("short", KEY)).toBe(false);
    expect(keysMatch(KEY + "x", KEY)).toBe(false);
  });
});

describe("FixedWindowRateLimiter", () => {
  it("resets after the window and bounds the number of tracked keys", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(1, 1000, () => now, 3);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    now = 1500;
    expect(limiter.check("a").allowed).toBe(true);
    for (const k of ["b", "c", "d", "e", "f"]) limiter.check(k);
    expect(limiter.check("zzz").allowed).toBe(true);
  });
});
