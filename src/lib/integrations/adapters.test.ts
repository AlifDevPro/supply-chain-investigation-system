import { describe, expect, it, vi } from "vitest";
import { MemoryDb, InMemorySignalRepository } from "@/lib/store/memory";
import { InMemoryIntegrationRepository } from "@/lib/store/memory-integrations";
import { InMemoryInvestigationRepository } from "@/lib/store/memory";
import { InMemoryGovernanceRepository } from "@/lib/store/memory-governance";
import { InMemoryExtractionRepository } from "@/lib/store/memory";
import { InMemoryBusinessRecordReader } from "@/lib/store/memory-records";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import { parseEnv } from "@/lib/env";
import { pollConnector } from "./adapters";

describe("connector poll", () => {
  it("records skipped when not configured", async () => {
    const db = new MemoryDb();
    const signals = new InMemorySignalRepository(db);
    const integrations = new InMemoryIntegrationRepository(db);
    const investigations = new InMemoryInvestigationRepository(db);
    const tenantId = "tenant-demo";
    await signals.ensureTenant(tenantId, "demo");
    const reader = new InMemoryBusinessRecordReader();
    reader.load(tenantId, syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z")), "2026-10-24T06:00:00.000Z");
    const env = parseEnv({ DATA_SOURCE: "memory" });
    const { run, configured } = await pollConnector(
      "mailbox",
      {
        env,
        tenantId,
        signals,
        integrations,
        pipeline: {
          repo: signals,
          caseIndex: { openCases: async () => [] },
          investigation: {
            signals,
            investigations,
            reader,
            extraction: { signals, extractions: new InMemoryExtractionRepository(db), ai: { provider: null, timeoutMs: 1, maxRetries: 0 } },
            governance: new InMemoryGovernanceRepository(db),
          },
        },
      },
      null,
    );
    expect(configured).toBe(false);
    expect(run.status).toBe("skipped");
    expect(run.metadata.reason).toBe("not_configured");
  });

  it("ingests a validated signal from a mock fetch", async () => {
    const db = new MemoryDb();
    const signals = new InMemorySignalRepository(db);
    const integrations = new InMemoryIntegrationRepository(db);
    const investigations = new InMemoryInvestigationRepository(db);
    const tenantId = "tenant-demo";
    await signals.ensureTenant(tenantId, "demo");
    const reader = new InMemoryBusinessRecordReader();
    reader.load(tenantId, syntheticBusinessDataset(new Date("2026-10-24T06:00:00.000Z")), "2026-10-24T06:00:00.000Z");
    const env = parseEnv({
      DATA_SOURCE: "memory",
      MAILBOX_BASE_URL: "http://127.0.0.1:3099",
      MAILBOX_API_KEY: "mock-source-key-demo-only",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            kind: "signals",
            signals: [
              {
                sourceType: "supplier_email",
                sourceSystem: "Mock mailbox (synthetic)",
                sourceRecordId: "MSG-ADAPTER-1",
                label: "Supplier notice: delay for PO-77410",
                references: { purchaseOrder: "PO-77410", material: "NV-4410" },
                dataMode: "synthetic",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    try {
      const { run, configured } = await pollConnector(
        "mailbox",
        {
          env,
          tenantId,
          signals,
          integrations,
          pipeline: {
            repo: signals,
            caseIndex: { openCases: async () => [] },
            investigation: {
              signals,
              investigations,
              reader,
              extraction: { signals, extractions: new InMemoryExtractionRepository(db), ai: { provider: null, timeoutMs: 1, maxRetries: 0 } },
              governance: new InMemoryGovernanceRepository(db),
            },
          },
        },
        null,
      );
      expect(configured).toBe(true);
      expect(run.status).toBe("completed");
      expect(run.signalsIngested).toBe(1);
      expect(run.httpStatusClass).toBe("2xx");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
