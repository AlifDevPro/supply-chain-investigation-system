import type { InvestigationDeps } from "@/lib/investigation/run";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import type { Runtime, StoreMode } from "@/lib/runtime";
import type { AiConfig } from "@/lib/ai/config";
import { MockProvider } from "@/lib/ai/mock";
import {
  InMemoryExtractionRepository,
  InMemoryInvestigationRepository,
  InMemorySignalRepository,
  MemoryDb,
} from "@/lib/store/memory";
import { InMemoryGovernanceRepository } from "@/lib/store/memory-governance";
import { InMemoryIntegrationRepository } from "@/lib/store/memory-integrations";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { seedDemoUsers } from "@/lib/auth/seed-users";

export const MOCK_AI: AiConfig = { provider: new MockProvider(), timeoutMs: 1000, maxRetries: 1 };
export const AI_OFF: AiConfig = { provider: null, timeoutMs: 1000, maxRetries: 1 };

/** Fixed "now" aligned with synthetic business records so requirement windows stay meaningful in tests. */
export const TEST_NOW = new Date("2026-10-24T06:00:00.000Z");
export const TEST_CLOCK = {
  now: () => new Date(TEST_NOW.getTime()),
  monotonicMs: () => TEST_NOW.getTime(),
};

/** Test-only: an in-memory Runtime with synthetic business records loaded for `tenantId`. */
export async function memoryRuntime(
  tenantId: string,
  mode: StoreMode = "memory",
  ai: AiConfig = MOCK_AI,
): Promise<Runtime & { db: MemoryDb }> {
  const db = new MemoryDb();
  const repo = new InMemorySignalRepository(db);
  const investigations = new InMemoryInvestigationRepository(db);
  const governance = new InMemoryGovernanceRepository(db);
  const reader = new InMemoryBusinessRecordReader();
  reader.load(tenantId, syntheticBusinessDataset(TEST_NOW), TEST_NOW.toISOString());
  await repo.ensureTenant(tenantId, "Demo");
  await seedDemoUsers(governance, tenantId, {
    reviewer: "reviewer-pass",
    procurement: "procurement-pass",
    manager: "manager-pass",
  });
  return {
    db, mode, repo, investigations, reader, catalog: reader, inspector: null, tenantId, ai,
    extractions: new InMemoryExtractionRepository(db), governance,
    integrations: new InMemoryIntegrationRepository(db),
    caseIndex: { openCases: () => investigations.openCaseReferences(tenantId) },
  };
}

export function depsOf(runtime: Runtime): InvestigationDeps {
  return {
    signals: runtime.repo,
    investigations: runtime.investigations,
    reader: runtime.reader,
    clock: TEST_CLOCK,
    extraction: { signals: runtime.repo, extractions: runtime.extractions, ai: runtime.ai, clock: TEST_CLOCK },
    governance: runtime.governance,
  };
}
