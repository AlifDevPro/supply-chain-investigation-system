import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedSyntheticSignals } from "@/lib/ingestion/seed";
import type { Runtime } from "@/lib/runtime";
import { depsOf, memoryRuntime as emptyRuntime } from "@/test/memory-runtime";

const state: { runtime: Promise<Runtime | null> } = { runtime: Promise.resolve(null) };
vi.mock("@/lib/runtime", () => ({ getRuntime: () => state.runtime, getLimiters: () => ({}) }));

import { DataUnavailableError, getActivityData, getInvestigationDetail, getOverviewData, listInvestigations, NotFoundError } from "./index";

const TENANT = "tenant-demo";

async function memoryRuntime(): Promise<Runtime> {
  const runtime = await emptyRuntime(TENANT);
  await seedSyntheticSignals(TENANT, { repo: runtime.repo, caseIndex: runtime.caseIndex, investigation: depsOf(runtime) });
  return runtime;
}

beforeEach(() => {
  state.runtime = Promise.resolve(null);
});

describe("persisted data source", () => {
  it("serves persisted events and signals with an honest source label and a snapshot mode", async () => {
    state.runtime = memoryRuntime();
    const activity = await getActivityData();
    expect(activity.mode).toBe("persisted snapshot");
    expect(activity.freshness.source).toContain("server memory");
    expect(activity.freshness.stale).toBe(false);
    expect(activity.events.length).toBeGreaterThan(20);
    expect(activity.signals.some((s) => s.processingStatus === "rejected")).toBe(true);
    expect(activity.signals.some((s) => s.processingStatus === "duplicate")).toBe(true);
    expect(activity.signals.some((s) => s.processingStatus === "held_for_review")).toBe(true);
    expect(activity.stages.review.waiting).toBeGreaterThan(0);
    expect(activity.stages.validated.failed).toBe(1);
  });

  it("serves persisted cases on the Overview and says where they come from", async () => {
    state.runtime = memoryRuntime();
    const overview = await getOverviewData();
    expect(overview.sources.cases).toContain("server memory");
    expect(overview.sources.signals).toContain("server memory");
    expect(overview.recentSignals.length).toBeGreaterThan(0);
    expect(overview.recentEvents.every((e) => e.status === "failed" || e.status === "waiting" || e.stage === "case" || e.stage === "action" || e.status === "retrying")).toBe(true);
    expect(overview.cases.length).toBeGreaterThan(0);
    expect(overview.cases.every((c) => c.id.startsWith("INV-3"))).toBe(true);
    expect(overview.metrics.shortages.total).toBeGreaterThan(0);
  });

  it("lists persisted cases and maps a case detail with runs, evidence and the README navy example", async () => {
    state.runtime = memoryRuntime();
    const { cases } = await listInvestigations();
    const navy = cases.find((c) => c.title.includes("NV-4410"));
    expect(navy).toMatchObject({ impactStatus: "provisional", shortage: { quantity: 5700, unit: "m", status: "provisional" }, requiresReview: true });
    expect(navy?.impactLabel).toBe("Provisional shortage 5,700 m");
    const { detail } = await getInvestigationDetail(navy!.id);
    expect(detail.detailAvailable).toBe(true);
    expect(detail.runs?.[0]?.runNumber).toBe(1);
    expect(detail.evidence.some((e) => e.sourceTable === "purchase_order_lines")).toBe(true);
    expect(detail.deliveryRisk?.arrivalBasis).toBe("reported_delay");
    expect(detail.actions.some((a) => a.id.endsWith("-RETRIEVE-QC") && a.origin === "rule_suggested")).toBe(true);
    expect(detail.sourceSignal?.label).toContain("NV-4410");
    expect(detail.events.some((e) => e.type === "investigation.created" && e.caseId === navy!.id)).toBe(true);
    expect(detail.audit.map((a) => a.action)).toContain("Case created");
    // The revision of the trim notice joined the case its original opened.
    const trim = cases.find((c) => c.title.includes("PO-77210"));
    expect((await getInvestigationDetail(trim!.id)).detail.linkedSignalIds).toHaveLength(2);
  });

  it("does not show fixture cases in persisted modes", async () => {
    state.runtime = memoryRuntime();
    await expect(getInvestigationDetail("INV-2041")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows an empty (not fixture) result for a tenant with no data", async () => {
    state.runtime = emptyRuntime(TENANT, "database");
    const activity = await getActivityData();
    expect(activity.events).toEqual([]);
    expect(activity.signals).toEqual([]);
    expect(activity.freshness.source).toContain("Supabase");
  });

  it("raises an explicit error when the store is unreachable, never falling back to fixtures, without leaking the cause", async () => {
    state.runtime = Promise.reject(new Error("connect ECONNREFUSED db.secret.supabase.co password=hunter2"));
    state.runtime.catch(() => undefined);
    const failure = await getActivityData().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DataUnavailableError);
    expect(JSON.stringify([(failure as Error).message, (failure as DataUnavailableError).hint])).not.toMatch(/hunter2|secret/);
    await expect(getOverviewData()).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("raises an explicit error when reading fails after connecting", async () => {
    const runtime = await emptyRuntime(TENANT, "database");
    runtime.repo.listEvents = async () => {
      throw new Error("relation signal_events does not exist");
    };
    state.runtime = Promise.resolve(runtime);
    const failure = await getActivityData().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DataUnavailableError);
    expect(JSON.stringify([(failure as Error).message, (failure as DataUnavailableError).hint])).not.toContain("relation");
  });

  it("fixtures remain the default when no store is configured", async () => {
    const activity = await getActivityData();
    expect(activity.mode).toBe("recorded replay");
    expect(activity.freshness.source).toBe("synthetic fixture");
  });
});
