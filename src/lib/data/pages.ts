import { evidence2041 } from "@/fixtures/investigation-2041";
import { SNAPSHOT_AT } from "@/fixtures/dataset";
import { EXTRACTION_PROMPT_VERSION } from "@/lib/ai/extraction-schema";
import { auditTrail, buildReviewQueue, catalogGraph, computeReportMetrics, expandableNodeIds, focusGraph, graphFocusOptions, parseReportWindow, type AuditRow, type GraphFocusKind, type ReportMetrics, type ReportWindow, type ReviewQueueItem, type SupplyGraph } from "@/lib/derive";
import type { EvidenceItem, InvestigationEvent, SignalRecord } from "@/lib/domain";
import { getEnv } from "@/lib/env";
import { TRIAGE_VERSION } from "@/lib/ingestion/triage";
import { RULE_VERSIONS } from "@/lib/investigation/investigate";
import { syntheticBusinessDataset } from "@/lib/investigation/seed-records";
import type { CatalogSnapshot, StoreInspection } from "@/lib/store/catalog-types";
import { emptyCatalog } from "@/lib/store/catalog-types";
import type { StoredExtraction } from "@/lib/store/extraction-types";
import type { Freshness, Scenario } from "./index";
import { freshness, gate, load, openStore, persistedFreshness, readFailed, readPersisted, readPersistedCases } from "./index";
import { signalToRecord as toRecord } from "./records";

const fixtureCatalog = (): CatalogSnapshot => ({
  ...syntheticBusinessDataset(new Date(SNAPSHOT_AT)),
  updatedAt: SNAPSHOT_AT,
  truncated: false,
});

async function browse(scenario: Scenario) {
  const rt = await openStore();
  if (rt) {
    try {
      const [{ signals, events }, cases, catalog, extractions] = await Promise.all([
        readPersisted(rt, { signals: 500, events: 500 }),
        readPersistedCases(rt, 200),
        rt.catalog.snapshot(rt.tenantId),
        rt.extractions.listExtractions(rt.tenantId, { limit: 200 }),
      ]);
      return { freshness: persistedFreshness(rt.mode), signals, events, cases, catalog, extractions, mode: rt.mode, inspector: rt.inspector };
    } catch (error) {
      readFailed(error);
    }
  }
  gate(scenario);
  const s = load();
  const empty = scenario === "empty";
  return {
    freshness: freshness(scenario),
    signals: empty ? [] : s.signals.map(toRecord),
    events: empty ? [] : s.events,
    cases: empty ? [] : s.cases,
    catalog: empty ? emptyCatalog() : fixtureCatalog(),
    extractions: [] as StoredExtraction[],
    mode: "fixtures" as const,
    inspector: null,
  };
}

export type ReviewQueueData = { freshness: Freshness; items: ReviewQueueItem[]; persisted: boolean };

export async function getReviewQueueData(scenario: Scenario = "ok"): Promise<ReviewQueueData> {
  const data = await browse(scenario);
  let closed = new Set<string>();
  const rt = await openStore();
  if (rt) {
    try {
      closed = new Set(await rt.governance.closedSignalIds(rt.tenantId));
    } catch (error) {
      readFailed(error);
    }
  }
  return {
    freshness: data.freshness,
    items: buildReviewQueue(data.signals, data.cases, data.freshness.asOf, closed),
    persisted: data.mode !== "fixtures",
  };
}

export type EvidenceExplorerData = { freshness: Freshness; evidence: EvidenceItem[] };

export async function getEvidenceExplorerData(scenario: Scenario = "ok"): Promise<EvidenceExplorerData> {
  const rt = await openStore();
  if (rt) {
    try {
      return { freshness: persistedFreshness(rt.mode), evidence: await rt.investigations.listEvidence(rt.tenantId, { limit: 200 }) };
    } catch (error) {
      readFailed(error);
    }
  }
  gate(scenario);
  return { freshness: freshness(scenario), evidence: scenario === "empty" ? [] : evidence2041 };
}

export type GraphData = {
  freshness: Freshness;
  graph: SupplyGraph;
  options: Array<{ kind: GraphFocusKind; id: string; label: string }>;
  focus: { kind: GraphFocusKind; id: string } | null;
  expanded: string[];
  expandable: string[];
  truncated: boolean;
};

export function parseGraphFocus(search: Record<string, string | string[] | undefined>): { kind: GraphFocusKind; id: string } | null {
  const kind = Array.isArray(search.focus) ? search.focus[0] : search.focus;
  const id = Array.isArray(search.id) ? search.id[0] : search.id;
  if (kind === "all" || !kind) return { kind: "all", id: "all" };
  if ((kind === "material" || kind === "purchase_order") && id) return { kind, id };
  return { kind: "all", id: "all" };
}

export function parseExpanded(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

export async function getGraphData(
  scenario: Scenario = "ok",
  search: Record<string, string | string[] | undefined> = {},
): Promise<GraphData> {
  const data = await browse(scenario);
  const focus = parseGraphFocus(search);
  const expanded = parseExpanded(search.expand);
  const full = catalogGraph(data.catalog);
  const graph = focusGraph(full, focus, expanded);
  return {
    freshness: data.freshness,
    graph,
    options: graphFocusOptions(data.catalog),
    focus,
    expanded,
    expandable: graph.focused ? expandableNodeIds(full, graph) : [],
    truncated: data.catalog.truncated,
  };
}

export type ReportsData = { freshness: Freshness; metrics: ReportMetrics; window: ReportWindow };

export async function getReportsData(
  scenario: Scenario = "ok",
  search: Record<string, string | string[] | undefined> = {},
): Promise<ReportsData> {
  const data = await browse(scenario);
  const window = parseReportWindow(search.window);
  let findings: Array<{ unknowns: number; conflicts: number }> = [];
  if (data.mode !== "fixtures") {
    const rt = await openStore();
    if (rt) {
      try {
        const items = await rt.investigations.listCases(rt.tenantId, { limit: 200 });
        findings = items.map((i) => ({ unknowns: i.latest?.unknowns ?? 0, conflicts: i.latest?.conflicts ?? 0 }));
      } catch (error) {
        readFailed(error);
      }
    }
  } else if (scenario !== "empty") {
    const detail = load().detail2041;
    findings = [{ unknowns: detail.unknowns.length, conflicts: detail.conflicts.length }];
  }
  return {
    freshness: data.freshness,
    window,
    metrics: computeReportMetrics({
      window,
      now: new Date(data.freshness.asOf),
      signals: data.signals,
      events: data.events,
      cases: data.cases,
      findings,
      extractions: data.extractions,
    }),
  };
}

export type IntegrationsData = {
  freshness: Freshness;
  ingest: { keyConfigured: boolean; bySystem: Array<{ system: string; count: number; lastReceived: string }>; lastReceived: string | null };
  store: { mode: string; migrations: Array<{ name: string; appliedAt: string }> | null };
  ai: { label: string | null; latestStatus: string | null; latestAt: string | null; count: number };
};

export async function getIntegrationsData(scenario: Scenario = "ok"): Promise<IntegrationsData> {
  const data = await browse(scenario);
  let keyConfigured = false;
  let aiLabel: string | null = null;
  try {
    const env = getEnv();
    keyConfigured = Boolean(env.INGEST_API_KEY);
    aiLabel = env.AI_PROVIDER === "none" ? null : env.AI_PROVIDER === "mock" ? "mock provider (deterministic, not a model)" : `local Ollama (${env.OLLAMA_MODEL ?? "model"})`;
  } catch {
    keyConfigured = false;
  }
  const bySystem = new Map<string, { count: number; lastReceived: string }>();
  for (const s of data.signals) {
    const system = s.sourceSystem ?? "not recorded";
    const prev = bySystem.get(system);
    if (!prev) bySystem.set(system, { count: 1, lastReceived: s.receivedAt });
    else {
      prev.count += 1;
      if (s.receivedAt > prev.lastReceived) prev.lastReceived = s.receivedAt;
    }
  }
  const latest = data.extractions[0] ?? null;
  let migrations: Array<{ name: string; appliedAt: string }> | null = null;
  if (data.inspector) {
    try {
      migrations = (await data.inspector.inspect()).migrations;
    } catch (error) {
      readFailed(error);
    }
  }
  return {
    freshness: data.freshness,
    ingest: {
      keyConfigured,
      bySystem: [...bySystem.entries()].map(([system, v]) => ({ system, ...v })).sort((a, b) => b.lastReceived.localeCompare(a.lastReceived)),
      lastReceived: data.signals.reduce<string | null>((max, s) => (!max || s.receivedAt > max ? s.receivedAt : max), null),
    },
    store: { mode: data.mode, migrations },
    ai: { label: aiLabel, latestStatus: latest?.status ?? null, latestAt: latest?.createdAt ?? null, count: data.extractions.length },
  };
}

export type AuditPageData = {
  freshness: Freshness;
  rows: AuditRow[];
  inspection: StoreInspection | null;
  storeMode: string;
};

export async function getAuditPageData(scenario: Scenario = "ok"): Promise<AuditPageData> {
  const data = await browse(scenario);
  let inspection: StoreInspection | null = null;
  if (data.inspector) {
    try {
      inspection = await data.inspector.inspect();
    } catch (error) {
      readFailed(error);
    }
  }
  return { freshness: data.freshness, rows: auditTrail(data.events), inspection, storeMode: data.mode };
}

export type SettingsData = {
  freshness: Freshness;
  dataSource: string;
  tenantId: string;
  ingestKey: "set" | "not set";
  databaseUrl: "set" | "not set";
  sessionSecret: "set" | "not set";
  googleSignIn: "set" | "not set";
  authMode: string;
  enableSyntheticSubmit: boolean;
  enableOperatorActions: boolean;
  aiProvider: string;
  ollamaModel: "set" | "not set";
  ollamaBaseUrl: string;
  aiTimeoutMs: number;
  aiMaxRetries: number;
  ruleVersions: Record<string, string>;
};

export function getSettingsData(scenario: Scenario = "ok"): SettingsData {
  // Settings are the running process configuration. Scenarios only affect the freshness banner in fixtures mode.
  if (scenario === "error" || scenario === "denied") gate(scenario);
  const env = getEnv();
  return {
    freshness: scenario === "stale" && env.DATA_SOURCE === "fixtures" ? freshness("stale") : {
      asOf: new Date().toISOString(),
      source: "server configuration (no secret values)",
      stale: false,
      note: null,
    },
    dataSource: env.DATA_SOURCE,
    tenantId: env.DEMO_TENANT_ID,
    ingestKey: env.INGEST_API_KEY ? "set" : "not set",
    databaseUrl: env.DATABASE_URL ? "set" : "not set",
    sessionSecret: env.SESSION_SECRET ? "set" : "not set",
    googleSignIn: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "set" : "not set",
    authMode: "signed session cookie; email sign-up (reviewer) and optional Google",
    enableSyntheticSubmit: env.ENABLE_SYNTHETIC_SUBMIT,
    enableOperatorActions: env.ENABLE_OPERATOR_ACTIONS,
    aiProvider: env.AI_PROVIDER,
    ollamaModel: env.OLLAMA_MODEL ? "set" : "not set",
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    aiTimeoutMs: env.AI_TIMEOUT_MS,
    aiMaxRetries: env.AI_MAX_RETRIES,
    ruleVersions: {
      triage: TRIAGE_VERSION,
      ...RULE_VERSIONS,
      extraction: EXTRACTION_PROMPT_VERSION,
    },
  };
}

export type { SignalRecord, InvestigationEvent, EvidenceItem };
