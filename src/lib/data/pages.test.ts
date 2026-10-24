import { describe, expect, it } from "vitest";
import { AccessDeniedError, DataUnavailableError } from "./index";
import { getAuditPageData, getEvidenceExplorerData, getGraphData, getIntegrationsData, getReportsData, getReviewQueueData, getSettingsData } from "./pages";

describe("explore page loaders (fixtures)", () => {
  it("builds a review queue from held fixture signals and cases awaiting review", async () => {
    const data = await getReviewQueueData();
    expect(data.items.some((i) => i.kind === "held_signal")).toBe(true);
    expect(data.items.some((i) => i.kind === "case")).toBe(true);
    expect((await getReviewQueueData("empty")).items).toEqual([]);
  });

  it("lists INV-2041 evidence and nothing in the empty scenario", async () => {
    const data = await getEvidenceExplorerData();
    expect(data.evidence.some((e) => e.caseId === "INV-2041")).toBe(true);
    expect((await getEvidenceExplorerData("empty")).evidence).toEqual([]);
  });

  it("builds a catalog graph and a focused material view", async () => {
    const all = await getGraphData("ok", { focus: "all" });
    expect(all.graph.nodes.some((n) => n.id === "material:NV-4410")).toBe(true);
    const focused = await getGraphData("ok", { focus: "material", id: "NV-4410" });
    expect(focused.graph.focused).toBe(true);
    expect(focused.graph.nodes.some((n) => n.id === "material:NV-4410")).toBe(true);
    expect(focused.expandable.length).toBeGreaterThan(0);
    const expanded = await getGraphData("ok", { focus: "material", id: "NV-4410", expand: focused.expandable[0] });
    expect(expanded.expanded).toEqual([focused.expandable[0]]);
    expect((await getGraphData("empty")).graph.nodes).toEqual([]);
  });

  it("defines every report figure and leaves rates unmeasured when empty", async () => {
    const reports = await getReportsData("ok", { window: "all" });
    expect(reports.metrics.windowLabel).toMatch(/All stored/);
    expect(reports.metrics.signalsInWindow).toBeGreaterThan(0);
    const empty = await getReportsData("empty");
    expect(empty.metrics.duplicateRate.rate).toBeNull();
    expect(empty.metrics.measuredLatency.medianMs).toBeNull();
  });

  it("describes integrations from observed records, not health claims", async () => {
    const data = await getIntegrationsData();
    expect(data.store.mode).toBe("fixtures");
    expect(data.store.migrations).toBeNull();
    expect(data.ingest.bySystem.length).toBeGreaterThan(0);
  });

  it("builds an audit trail from fixture events", async () => {
    const data = await getAuditPageData();
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.inspection).toBeNull();
    expect(data.storeMode).toBe("fixtures");
  });

  it("shows configuration as set or not set and never throws on the happy path", () => {
    const s = getSettingsData();
    expect(s.ingestKey === "set" || s.ingestKey === "not set").toBe(true);
    expect(s.databaseUrl === "set" || s.databaseUrl === "not set").toBe(true);
    expect(s.ruleVersions.extraction).toBe("signal-extraction.v1");
    expect(s.ruleVersions.triage).toBe("triage.v1");
  });

  it("honours error, denied and stale scenarios", async () => {
    await expect(getReviewQueueData("error")).rejects.toBeInstanceOf(DataUnavailableError);
    await expect(getEvidenceExplorerData("denied")).rejects.toBeInstanceOf(AccessDeniedError);
    expect((await getReportsData("stale")).freshness.stale).toBe(true);
    expect(() => getSettingsData("denied")).toThrow(AccessDeniedError);
  });
});
