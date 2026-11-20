import { evidence2041 } from "@/fixtures/investigation-2041";
import { SNAPSHOT_AT } from "@/fixtures/dataset";
import { EXTRACTION_PROMPT_VERSION } from "@/lib/ai/extraction-schema";
import { fixtureOpenCaseReferences } from "@/fixtures/case-references";
import {
  auditTrail,
  buildReviewQueue,
  catalogGraph,
  computeReportMetrics,
  expandableNodeIds,
  focusGraph,
  graphFocusOptions,
  parseReportWindow,
  reportDataSourceLabel,
  signalMentionEdges,
  type AuditRow,
  type GraphFocusKind,
  type ReportMetrics,
  type ReportWindow,
  type ReviewQueueItem,
  type SignalMentionRefs,
  type SupplyGraph,
} from "@/lib/derive";
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

const MAX_MENTION_SIGNALS = 100;

async function loadSignalMentions(
  mode: "fixtures" | "memory" | "database",
  signalIds: readonly string[],
): Promise<SignalMentionRefs[]> {
  if (mode === "fixtures") {
    return fixtureOpenCaseReferences.map((c) => c.references);
  }
  const rt = await openStore();
  if (!rt) return [];
  const mentions: SignalMentionRefs[] = [];
  for (const id of signalIds.slice(0, MAX_MENTION_SIGNALS)) {
    try {
      const full = await rt.repo.getSignal(rt.tenantId, id);
      if (full?.normalized?.references) mentions.push(full.normalized.references);
    } catch {
      /* skip unreadable row */
    }
  }
  return mentions;
}

function evidenceMatchesQuery(e: EvidenceItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    e.sourceRecordId.toLowerCase().includes(needle) ||
    e.title.toLowerCase().includes(needle) ||
    e.excerpt.toLowerCase().includes(needle) ||
    (e.sourceTable?.toLowerCase().includes(needle) ?? false) ||
    e.caseId.toLowerCase().includes(needle)
  );
}

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

export type EvidenceExplorerData = { freshness: Freshness; evidence: EvidenceItem[]; query: string | null };

export function parseEvidenceQuery(search: Record<string, string | string[] | undefined> = {}): string | null {
  const raw = Array.isArray(search.q) ? search.q[0] : search.q;
  const q = raw?.trim() ?? "";
  return q.length > 0 ? q.slice(0, 120) : null;
}

export async function getEvidenceExplorerData(
  scenario: Scenario = "ok",
  search: Record<string, string | string[] | undefined> = {},
): Promise<EvidenceExplorerData> {
  const query = parseEvidenceQuery(search);
  const filter = (rows: EvidenceItem[]) => (query ? rows.filter((e) => evidenceMatchesQuery(e, query)) : rows);
  const rt = await openStore();
  if (rt) {
    try {
      const evidence = filter(await rt.investigations.listEvidence(rt.tenantId, { limit: 200 }));
      return { freshness: persistedFreshness(rt.mode), evidence, query };
    } catch (error) {
      readFailed(error);
    }
  }
  gate(scenario);
  return { freshness: freshness(scenario), evidence: filter(scenario === "empty" ? [] : evidence2041), query };
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
  const mentions = await loadSignalMentions(
    data.mode,
    data.signals.map((s) => s.id),
  );
  const inferred = signalMentionEdges(mentions, data.catalog);
  const full = catalogGraph(data.catalog, inferred);
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

export type ReportsData = {
  freshness: Freshness;
  metrics: ReportMetrics;
  window: ReportWindow;
  /** Honest description of where the numbers come from. */
  sourceLabel: string;
};

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
    sourceLabel: reportDataSourceLabel(data.mode),
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

export type ConnectorCardData = {
  id: "mailbox" | "erp_po" | "carrier";
  label: string;
  version: string;
  configured: boolean;
  lastRun: {
    id: string;
    status: string;
    at: string;
    signalsIngested: number;
    errorClass: string | null;
    httpStatusClass: string | null;
  } | null;
};

export type IntegrationsData = {
  freshness: Freshness;
  ingest: { keyConfigured: boolean; bySystem: Array<{ system: string; count: number; lastReceived: string }>; lastReceived: string | null };
  store: { mode: string; migrations: Array<{ name: string; appliedAt: string }> | null };
  ai: { label: string | null; latestStatus: string | null; latestAt: string | null; count: number };
  mcp: {
    keyConfigured: boolean;
    tools: Array<{ name: string; description: string }>;
    recentCalls: Array<{
      id: string;
      toolName: string;
      status: string;
      at: string;
      durationMs: number | null;
      errorClass: string | null;
    }>;
  };
  connectors: ConnectorCardData[];
  canOperate: boolean;
  operateReason: string | null;
};

export async function getIntegrationsData(scenario: Scenario = "ok"): Promise<IntegrationsData> {
  const data = await browse(scenario);
  let keyConfigured = false;
  let mcpConfigured = false;
  let aiLabel: string | null = null;
  let connectors: ConnectorCardData[] = [
    { id: "mailbox", label: "Supplier email mailbox", version: "mailbox.v1", configured: false, lastRun: null },
    { id: "erp_po", label: "ERP purchase-order connector", version: "erp_po.v1", configured: false, lastRun: null },
    { id: "carrier", label: "Carrier tracking feed", version: "carrier.v1", configured: false, lastRun: null },
  ];
  let tools: Array<{ name: string; description: string }> = [];
  let recentCalls: IntegrationsData["mcp"]["recentCalls"] = [];
  let canOperate = false;
  let operateReason: string | null = "Sign in with a reviewer role or higher when a store is configured.";
  try {
    const env = getEnv();
    keyConfigured = Boolean(env.INGEST_API_KEY);
    mcpConfigured = Boolean(env.MCP_API_KEY);
    aiLabel = env.AI_PROVIDER === "none" ? null : env.AI_PROVIDER === "mock" ? "mock provider (deterministic, not a model)" : `local Ollama (${env.OLLAMA_MODEL ?? "model"})`;
    const { connectorConfigs, isConfigured } = await import("@/lib/integrations/config");
    const { listToolDefs } = await import("@/lib/mcp/host");
    tools = listToolDefs();
    connectors = connectorConfigs(env).map((c) => ({
      id: c.id,
      label: c.label,
      version: c.version,
      configured: isConfigured(c),
      lastRun: null,
    }));
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
  try {
    const { getRuntime } = await import("@/lib/runtime");
    const { readSession } = await import("@/lib/auth/session");
    const { canReview } = await import("@/lib/auth/roles");
    const runtime = await getRuntime();
    if (runtime) {
      const [calls, runs] = await Promise.all([
        runtime.integrations.listToolCalls(runtime.tenantId, { limit: 10 }),
        runtime.integrations.listConnectorRuns(runtime.tenantId, { limit: 30 }),
      ]);
      recentCalls = calls.map((c) => ({
        id: c.id,
        toolName: c.toolName,
        status: c.status,
        at: c.at,
        durationMs: c.durationMs,
        errorClass: c.errorClass,
      }));
      connectors = connectors.map((card) => {
        const last = runs.find((r) => r.connectorId === card.id) ?? null;
        return {
          ...card,
          lastRun: last
            ? {
                id: last.id,
                status: last.status,
                at: last.at,
                signalsIngested: last.signalsIngested,
                errorClass: last.errorClass,
                httpStatusClass: last.httpStatusClass,
              }
            : null,
        };
      });
      const session = await readSession();
      if (session && session.tenantId === runtime.tenantId && canReview(session.role)) {
        canOperate = true;
        operateReason = null;
      } else if (!session) {
        operateReason = "Sign in to run connectors or an MCP smoke call.";
      } else {
        operateReason = "Reviewer role or higher is required.";
      }
    } else {
      operateReason = "Connector and MCP actions need DATA_SOURCE=memory or database.";
    }
  } catch {
    /* leave defaults */
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
    mcp: { keyConfigured: mcpConfigured, tools, recentCalls },
    connectors,
    canOperate,
    operateReason,
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
  mcpKey: "set" | "not set";
  mcpTimeoutMs: number;
  connectors: Array<{ id: string; configured: boolean }>;
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
    mcpKey: env.MCP_API_KEY ? "set" : "not set",
    mcpTimeoutMs: env.MCP_TOOL_TIMEOUT_MS,
    connectors: [
      { id: "mailbox", configured: Boolean(env.MAILBOX_BASE_URL && env.MAILBOX_API_KEY) },
      { id: "erp_po", configured: Boolean(env.ERP_BASE_URL && env.ERP_API_KEY) },
      { id: "carrier", configured: Boolean(env.CARRIER_BASE_URL && env.CARRIER_API_KEY) },
    ],
    ruleVersions: {
      triage: TRIAGE_VERSION,
      ...RULE_VERSIONS,
      extraction: EXTRACTION_PROMPT_VERSION,
    },
  };
}

export type { SignalRecord, InvestigationEvent, EvidenceItem };
