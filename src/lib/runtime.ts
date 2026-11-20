import "server-only";
import { createAiConfig, type AiConfig } from "@/lib/ai/config";
import { createPostgresClient } from "@/lib/db/postgres-client";
import { getEnv } from "@/lib/env";
import { demoPasswordsFromEnv, seedDemoUsers } from "@/lib/auth/seed-users";
import { FixedWindowRateLimiter } from "@/lib/ingestion/rate-limit";
import { seedSyntheticSignals } from "@/lib/ingestion/seed";
import type { CaseReferenceSource } from "@/lib/ingestion/triage";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import type { InvestigationDeps } from "@/lib/investigation/run";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import type { ExtractionRepository } from "@/lib/store/extraction-types";
import type { InvestigationRepository } from "@/lib/store/investigation-types";
import {
  InMemoryExtractionRepository,
  InMemoryInvestigationRepository,
  InMemorySignalRepository,
  MemoryDb,
} from "@/lib/store/memory";
import type { BusinessRecordCatalog, StoreInspector } from "@/lib/store/catalog-types";
import type { GovernanceRepository } from "@/lib/store/governance-types";
import type { IntegrationRepository } from "@/lib/store/integration-types";
import { InMemoryGovernanceRepository } from "@/lib/store/memory-governance";
import { InMemoryIntegrationRepository } from "@/lib/store/memory-integrations";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { PostgresSignalRepository } from "@/lib/store/postgres";
import { PostgresBusinessRecordCatalog, PostgresStoreInspector } from "@/lib/store/postgres-catalog";
import { PostgresExtractionRepository } from "@/lib/store/postgres-extractions";
import { PostgresGovernanceRepository } from "@/lib/store/postgres-governance";
import { PostgresIntegrationRepository } from "@/lib/store/postgres-integrations";
import { PostgresInvestigationRepository } from "@/lib/store/postgres-investigations";
import { PostgresBusinessRecordReader } from "@/lib/store/postgres-records";
import type { SignalRepository } from "@/lib/store/types";

export type StoreMode = "memory" | "database";

export interface Runtime {
  mode: StoreMode;
  repo: SignalRepository;
  investigations: InvestigationRepository;
  reader: BusinessRecordReader;
  catalog: BusinessRecordCatalog;
  inspector: StoreInspector | null;
  extractions: ExtractionRepository;
  governance: GovernanceRepository;
  integrations: IntegrationRepository;
  ai: AiConfig;
  tenantId: string;
  caseIndex: CaseReferenceSource;
}

interface Globals {
  __sciRuntime?: Promise<Runtime | null>;
  __sciRuntimeGen?: number;
  __sciIngestLimiter?: FixedWindowRateLimiter;
  __sciAuthFailLimiter?: FixedWindowRateLimiter;
  __sciLoginLimiter?: FixedWindowRateLimiter;
  __sciSignupLimiter?: FixedWindowRateLimiter;
  __sciOperatorLimiter?: FixedWindowRateLimiter;
  __sciMcpLimiter?: FixedWindowRateLimiter;
  __sciConnectorLimiter?: FixedWindowRateLimiter;
  __sciFixtureAuth?: { db: MemoryDb; governance: InMemoryGovernanceRepository; seeded: Promise<void> };
}
const g = globalThis as unknown as Globals;

/** Bump when `Runtime` gains fields so a long-lived dev process does not keep a stale singleton. */
const RUNTIME_CACHE_GEN = 5;
if (g.__sciRuntimeGen !== RUNTIME_CACHE_GEN) {
  g.__sciRuntime = undefined;
  g.__sciRuntimeGen = RUNTIME_CACHE_GEN;
}

export function investigationDeps(runtime: Runtime): InvestigationDeps {
  return {
    signals: runtime.repo,
    investigations: runtime.investigations,
    reader: runtime.reader,
    extraction: { signals: runtime.repo, extractions: runtime.extractions, ai: runtime.ai },
    governance: runtime.governance,
  };
}

async function create(): Promise<Runtime | null> {
  const env = getEnv();
  if (env.DATA_SOURCE === "fixtures") return null;
  const tenantId = env.DEMO_TENANT_ID;
  const ai = createAiConfig(env);
  if (env.DATA_SOURCE === "memory") {
    const db = new MemoryDb();
    const repo = new InMemorySignalRepository(db);
    const investigations = new InMemoryInvestigationRepository(db);
    const governance = new InMemoryGovernanceRepository(db);
    const reader = new InMemoryBusinessRecordReader();
    const now = new Date();
    reader.load(tenantId, syntheticBusinessDataset(now), now.toISOString());
    await repo.ensureTenant(tenantId, "Demo tenant (synthetic)");
    await seedDemoUsers(governance, tenantId, demoPasswordsFromEnv());
    const runtime: Runtime = {
      mode: "memory", repo, investigations, reader, catalog: reader, inspector: null, tenantId, ai,
      extractions: new InMemoryExtractionRepository(db), governance,
      integrations: new InMemoryIntegrationRepository(db),
      caseIndex: { openCases: () => investigations.openCaseReferences(tenantId) },
    };
    await seedSyntheticSignals(tenantId, { repo, caseIndex: runtime.caseIndex, investigation: investigationDeps(runtime) });
    return runtime;
  }
  const client = createPostgresClient(env.DATABASE_URL!, { max: env.DATABASE_POOL_MAX });
  const repo = new PostgresSignalRepository(client);
  const investigations = new PostgresInvestigationRepository(client);
  const governance = new PostgresGovernanceRepository(client);
  await repo.ensureTenant(tenantId, "Demo tenant (synthetic)");
  return {
    mode: "database", repo, investigations, reader: new PostgresBusinessRecordReader(client),
    catalog: new PostgresBusinessRecordCatalog(client), inspector: new PostgresStoreInspector(client), tenantId, ai,
    extractions: new PostgresExtractionRepository(client), governance,
    integrations: new PostgresIntegrationRepository(client),
    caseIndex: { openCases: () => investigations.openCaseReferences(tenantId) },
  };
}

export function mcpHostDeps(runtime: Runtime) {
  return {
    tenantId: runtime.tenantId,
    reader: runtime.reader,
    integrations: runtime.integrations,
    signals: runtime.repo,
    timeoutMs: getEnv().MCP_TOOL_TIMEOUT_MS,
  };
}

export function getMcpLimiter() {
  g.__sciMcpLimiter ??= new FixedWindowRateLimiter(60, 60_000);
  return g.__sciMcpLimiter;
}

export function getConnectorLimiter() {
  g.__sciConnectorLimiter ??= new FixedWindowRateLimiter(10, 60_000);
  return g.__sciConnectorLimiter;
}

export function getRuntime(): Promise<Runtime | null> {
  if (!g.__sciRuntime) {
    const started = create();
    g.__sciRuntime = started;
    started.catch(() => {
      if (g.__sciRuntime === started) g.__sciRuntime = undefined;
    });
  }
  return g.__sciRuntime;
}

/** Users for fixtures login, so `?scenario=` pages still work after sign-in. */
export function getFixtureGovernance(): InMemoryGovernanceRepository {
  if (!g.__sciFixtureAuth) {
    const db = new MemoryDb();
    const governance = new InMemoryGovernanceRepository(db);
    const seeded = (async () => {
      db.tenants.add(getEnv().DEMO_TENANT_ID);
      await seedDemoUsers(governance, getEnv().DEMO_TENANT_ID, demoPasswordsFromEnv());
    })();
    g.__sciFixtureAuth = { db, governance, seeded };
  }
  return g.__sciFixtureAuth.governance;
}

export async function readyFixtureGovernance(): Promise<InMemoryGovernanceRepository> {
  const gov = getFixtureGovernance();
  await g.__sciFixtureAuth!.seeded;
  return gov;
}

export async function getGovernance(tenantId?: string): Promise<{ tenantId: string; governance: GovernanceRepository } | null> {
  const runtime = await getRuntime();
  if (runtime) return { tenantId: runtime.tenantId, governance: runtime.governance };
  const env = getEnv();
  if (env.DATA_SOURCE !== "fixtures") return null;
  return { tenantId: tenantId ?? env.DEMO_TENANT_ID, governance: await readyFixtureGovernance() };
}

export function getLimiters() {
  g.__sciIngestLimiter ??= new FixedWindowRateLimiter(30, 60_000);
  g.__sciAuthFailLimiter ??= new FixedWindowRateLimiter(60, 60_000);
  return { limiter: g.__sciIngestLimiter, authFailureLimiter: g.__sciAuthFailLimiter };
}

export function getLoginLimiter() {
  g.__sciLoginLimiter ??= new FixedWindowRateLimiter(10, 60_000);
  return g.__sciLoginLimiter;
}

export function getSignupLimiter() {
  g.__sciSignupLimiter ??= new FixedWindowRateLimiter(5, 60_000);
  return g.__sciSignupLimiter;
}

export function getOperatorLimiter() {
  g.__sciOperatorLimiter ??= new FixedWindowRateLimiter(10, 60_000);
  return g.__sciOperatorLimiter;
}
