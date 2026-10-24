import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { InMemoryExtractionRepository, InMemoryInvestigationRepository, InMemorySignalRepository, MemoryDb } from "./memory";
import { describeExtractionContract } from "./extraction-contract";
import { InMemoryBusinessRecordReader } from "./memory-records";
import { describeSignalRepositoryContract, TENANT_A } from "./contract";
import { describeInvestigationContract } from "./investigation-contract";
import { describeCatalogContract } from "./catalog-contract";
import { describeGovernanceContract } from "./governance-contract";
import { InMemoryGovernanceRepository } from "./memory-governance";
import { makeCase } from "./investigation-contract";

describeSignalRepositoryContract("in-memory", async () => ({ repo: new InMemorySignalRepository() }));

describeInvestigationContract("in-memory", async () => {
  const db = new MemoryDb();
  const reader = new InMemoryBusinessRecordReader();
  const seededAt = new Date("2026-10-24T06:00:00.000Z");
  reader.load(TENANT_A, syntheticBusinessDataset(seededAt), seededAt.toISOString());
  return { signals: new InMemorySignalRepository(db), investigations: new InMemoryInvestigationRepository(db), reader };
});

describeExtractionContract("in-memory", async () => {
  const db = new MemoryDb();
  return { signals: new InMemorySignalRepository(db), extractions: new InMemoryExtractionRepository(db) };
});

describeCatalogContract("in-memory", async () => {
  const catalog = new InMemoryBusinessRecordReader();
  return {
    catalog,
    seed: (tenantId) => catalog.load(tenantId, syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z")), "2026-10-24T06:00:00.000Z"),
  };
});

describeGovernanceContract("in-memory", async () => {
  const db = new MemoryDb();
  const signals = new InMemorySignalRepository(db);
  const investigations = new InMemoryInvestigationRepository(db);
  return {
    governance: new InMemoryGovernanceRepository(db),
    ensureTenant: (id) => signals.ensureTenant(id, id),
    seedCase: (tenantId, caseId) => investigations.transaction((tx) => tx.insertCase(makeCase(caseId, tenantId))),
  };
});
