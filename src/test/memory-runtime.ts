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
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { seedDemoUsers } from "@/lib/auth/seed-users";

export const MOCK_AI: AiConfig = { provider: new MockProvider(), timeoutMs: 1000, maxRetries: 1 };
export const AI_OFF: AiConfig = { provider: null, timeoutMs: 1000, maxRetries: 1 };

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
  const now = new Date("2026-10-24T06:00:00.000Z");
  reader.load(tenantId, syntheticBusinessDataset(now), now.toISOString());
  await repo.ensureTenant(tenantId, "Demo");
  await seedDemoUsers(governance, tenantId, {
    reviewer: "reviewer-pass",
    procurement: "procurement-pass",
    manager: "manager-pass",
  });
  return {
    db, mode, repo, investigations, reader, catalog: reader, inspector: null, tenantId, ai,
    extractions: new InMemoryExtractionRepository(db), governance,
    caseIndex: { openCases: () => investigations.openCaseReferences(tenantId) },
  };
}

export function depsOf(runtime: Runtime): InvestigationDeps {
  return {
    signals: runtime.repo,
    investigations: runtime.investigations,
    reader: runtime.reader,
    extraction: { signals: runtime.repo, extractions: runtime.extractions, ai: runtime.ai },
    governance: runtime.governance,
  };
}
