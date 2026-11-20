import { z } from "zod";
import {
  attentionItems,
  computeOverviewMetrics,
  sortEventsNewestFirst,
  stageDistribution,
  summarizeStages,
  type AttentionItem,
  type OverviewMetrics,
  type StageSummary,
} from "@/lib/derive";
import {
  caseSchema,
  caseStateSchema,
  investigationDetailSchema,
  investigationEventSchema,
  signalSchema,
  type CaseState,
  type InvestigationCase,
  type InvestigationDetail,
  type InvestigationEvent,
  type Signal,
  type SignalRecord,
} from "@/lib/domain";
import { fixtureOpenCaseReferences } from "@/fixtures/case-references";
import { cases as rawCases, events as rawEvents, signals as rawSignals, SNAPSHOT_AT } from "@/fixtures/dataset";
import {
  actions2041,
  audit2041,
  claims2041,
  conflicts2041,
  entityEdges2041,
  entityNodes2041,
  evidence2041,
  impact2041,
  signal2041,
  unknowns2041,
} from "@/fixtures/investigation-2041";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getRuntime, type Runtime } from "@/lib/runtime";
import type { AiExtractionView, AiPanelData } from "@/lib/ai/view";
import type { StoredExtraction } from "@/lib/store/extraction-types";
import { signalToRecord } from "./records";
import { listItemToCase, toInvestigationDetail } from "./cases";
import { toProposedAction } from "@/lib/store/governance-types";

/**
 * Data-access boundary. Phase 1 reads validated synthetic fixtures. A later phase replaces this module's
 * internals with authenticated API calls; components and pages depend only on these functions and types.
 *
 * Fixture scenarios exist so every UI state (empty, error, permission denied, stale) can be reached
 * and reviewed without a backend. They only affect this fixture source.
 */

export const SCENARIOS = ["ok", "empty", "error", "denied", "stale"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function parseScenario(value: string | string[] | undefined): Scenario {
  const v = Array.isArray(value) ? value[0] : value;
  return (SCENARIOS as readonly string[]).includes(v ?? "") ? (v as Scenario) : "ok";
}

export class AccessDeniedError extends Error {
  constructor(message = "You do not have access to this data.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
export class DataUnavailableError extends Error {
  /**
   * Text that is safe to show to a user (written by us, never copied from a driver or source error).
   * `message` may contain internals and is never rendered.
   */
  readonly hint: string | null;
  constructor(message = "The data source is unavailable.", hint: string | null = null) {
    super(message);
    this.name = "DataUnavailableError";
    this.hint = hint;
  }
}
export class NotFoundError extends Error {
  constructor(message = "Record not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export type Freshness = {
  asOf: string;
  source: string;
  /** true when the data should be treated as possibly out of date. */
  stale: boolean;
  note: string | null;
};

export function freshness(scenario: Scenario): Freshness {
  return {
    asOf: SNAPSHOT_AT,
    source: "synthetic fixture",
    stale: scenario === "stale",
    note:
      scenario === "stale"
        ? "The last successful update is older than the freshness threshold. Values may not reflect current conditions."
        : null,
  };
}

export function gate(scenario: Scenario): void {
  if (scenario === "error") throw new DataUnavailableError("The synthetic data source returned an error (scenario: error).");
  if (scenario === "denied") throw new AccessDeniedError();
}

/**
 * Opens the configured store. `null` means DATA_SOURCE=fixtures. A configured-but-unreachable store is an
 * explicit error: the app never silently falls back to fixtures (AGENTS.md 8.2, 18).
 */
export async function openStore(): Promise<Runtime | null> {
  try {
    return await getRuntime();
  } catch (error) {
    logEvent("error", "data.store_unavailable", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    throw new DataUnavailableError(
      "Signal store unavailable.",
      "The configured signal store is unreachable or misconfigured. No data was substituted. Check DATABASE_URL and run npm run db:migrate.",
    );
  }
}

export function persistedFreshness(mode: Runtime["mode"]): Freshness {
  return {
    asOf: new Date().toISOString(),
    source: mode === "database" ? "synthetic data in Supabase Postgres" : "synthetic data in server memory (resets on restart)",
    stale: false,
    note: null,
  };
}

export function readFailed(error: unknown): never {
  logEvent("error", "data.read_failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
  throw new DataUnavailableError(
    "Store read failed.",
    "The store could not be read. No data was substituted. If this follows an upgrade, run npm run db:migrate.",
  );
}

export async function readPersistedCases(rt: Runtime, limit: number): Promise<InvestigationCase[]> {
  try {
    return (await rt.investigations.listCases(rt.tenantId, { limit })).map(listItemToCase);
  } catch (error) {
    readFailed(error);
  }
}

export async function readPersisted(rt: Runtime, limits: { signals: number; events: number }) {
  try {
    const [signals, events] = await Promise.all([
      rt.repo.listSignals(rt.tenantId, { limit: limits.signals }),
      rt.repo.listEvents(rt.tenantId, { limit: limits.events }),
    ]);
    return { signals, events };
  } catch (error) {
    logEvent("error", "data.read_failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    throw new DataUnavailableError("Signal store read failed.", "The signal store could not be read. No data was substituted.");
  }
}

function toAiView(x: StoredExtraction): AiExtractionView {
  return {
    id: x.id, signalId: x.signalId, provider: x.provider, model: x.model, promptVersion: x.promptVersion, status: x.status,
    failure: x.failure, fields: x.fields, rejected: x.rejected, comparison: x.comparison, latencyMs: x.latencyMs,
    attempts: x.attempts, inputTokens: x.inputTokens, outputTokens: x.outputTokens, createdAt: x.createdAt,
  };
}

/** Latest AI extraction per signal plus the provider configured now. Throws on read failure (never empty-on-error). */
async function readAiPanel(rt: Runtime, signalIds: readonly string[]): Promise<AiPanelData> {
  const latest = signalIds.length ? await rt.extractions.latestForSignals(rt.tenantId, signalIds) : {};
  return {
    configured: rt.ai.provider ? { label: rt.ai.provider.label } : null,
    bySignal: Object.fromEntries(Object.entries(latest).map(([id, x]) => [id, toAiView(x)])),
  };
}

// Validate fixtures once, at first use. A malformed fixture must fail loudly, not render quietly.
export type Store = { cases: InvestigationCase[]; events: InvestigationEvent[]; signals: Signal[]; detail2041: InvestigationDetail };
let store: Store | null = null;

export function load(): Store {
  if (store) return store;
  const cases = z.array(caseSchema).parse(rawCases);
  const events = z.array(investigationEventSchema).parse(rawEvents);
  const signals = z.array(signalSchema).parse(rawSignals);
  const case2041 = cases.find((c) => c.id === "INV-2041");
  if (!case2041) throw new Error("Fixture INV-2041 missing");
  const detail2041 = investigationDetailSchema.parse({
    case: case2041,
    detailAvailable: true,
    sourceSignal: signal2041,
    evidence: evidence2041,
    claims: claims2041,
    impact: impact2041,
    unknowns: unknowns2041,
    conflicts: conflicts2041,
    entities: { nodes: entityNodes2041, edges: entityEdges2041 },
    actions: actions2041,
    events: events.filter((e) => e.caseId === "INV-2041" || e.signalId === "SIG-8841"),
    audit: audit2041,
  } satisfies InvestigationDetail);
  store = { cases, events, signals, detail2041 };
  return store;
}

export const LIFECYCLE_ORDER: readonly CaseState[] = caseStateSchema.options;

export type OverviewData = {
  freshness: Freshness;
  metrics: OverviewMetrics;
  attention: AttentionItem[];
  cases: InvestigationCase[];
  recentSignals: SignalRecord[];
  recentEvents: InvestigationEvent[];
  distribution: Array<{ state: CaseState; count: number }>;
  /** Where each panel's data comes from. */
  sources: { signals: string; events: string; cases: string };
  /** As-of time of the cases behind the metrics. */
  casesAsOf: string;
};

const FIXTURE_SOURCE = "synthetic fixture";

const isImportant = (e: InvestigationEvent) =>
  e.status === "failed" || e.status === "waiting" || e.status === "retrying" || e.stage === "case" || e.stage === "action";

export async function getOverviewData(scenario: Scenario = "ok"): Promise<OverviewData> {
  const rt = await openStore();
  if (rt) {
    // Scenarios only exist for fixtures. Everything here is read from the store.
    const [persisted, cases] = await Promise.all([readPersisted(rt, { signals: 8, events: 200 }), readPersistedCases(rt, 200)]);
    const fresh = persistedFreshness(rt.mode);
    return {
      freshness: fresh,
      metrics: computeOverviewMetrics(cases),
      attention: attentionItems(cases),
      cases,
      recentSignals: persisted.signals,
      recentEvents: persisted.events.filter(isImportant).slice(0, 5),
      distribution: stageDistribution(cases, LIFECYCLE_ORDER),
      sources: { signals: fresh.source, events: fresh.source, cases: fresh.source },
      casesAsOf: fresh.asOf,
    };
  }
  gate(scenario);
  const s = load();
  const fresh = freshness(scenario);
  if (scenario === "empty") {
    return {
      freshness: fresh,
      metrics: computeOverviewMetrics([]),
      attention: [],
      cases: [],
      recentSignals: [],
      recentEvents: [],
      distribution: [],
      sources: { signals: FIXTURE_SOURCE, events: FIXTURE_SOURCE, cases: FIXTURE_SOURCE },
      casesAsOf: SNAPSHOT_AT,
    };
  }
  const important = sortEventsNewestFirst(s.events).filter(isImportant);
  return {
    freshness: fresh,
    metrics: computeOverviewMetrics(s.cases),
    attention: attentionItems(s.cases),
    cases: s.cases,
    recentSignals: [...s.signals]
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
      .slice(0, 8)
      .map(signalToRecord),
    recentEvents: important.slice(0, 5),
    distribution: stageDistribution(s.cases, LIFECYCLE_ORDER),
    sources: { signals: FIXTURE_SOURCE, events: FIXTURE_SOURCE, cases: FIXTURE_SOURCE },
    casesAsOf: SNAPSHOT_AT,
  };
}

export type InvestigationList = { freshness: Freshness; cases: InvestigationCase[]; ref: string | null };

export function parseInvestigationRef(search: Record<string, string | string[] | undefined> = {}): string | null {
  const raw = Array.isArray(search.ref) ? search.ref[0] : search.ref;
  const ref = raw?.trim() ?? "";
  return ref.length > 0 ? ref.slice(0, 64) : null;
}

function caseMatchesRef(c: InvestigationCase, ref: string): boolean {
  const needle = ref.trim().toLowerCase();
  if (!needle) return true;
  if (c.id.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle) || c.summary.toLowerCase().includes(needle)) {
    return true;
  }
  const indexed = fixtureOpenCaseReferences.find((r) => r.caseId === c.id);
  if (!indexed) return false;
  return Object.values(indexed.references).some((v) => typeof v === "string" && v.toLowerCase() === needle);
}

export async function listInvestigations(
  scenario: Scenario = "ok",
  search: Record<string, string | string[] | undefined> = {},
): Promise<InvestigationList> {
  const ref = parseInvestigationRef(search);
  const filter = (cases: InvestigationCase[]) => (ref ? cases.filter((c) => caseMatchesRef(c, ref)) : cases);
  const rt = await openStore();
  if (rt) return { freshness: persistedFreshness(rt.mode), cases: filter(await readPersistedCases(rt, 500)), ref };
  gate(scenario);
  const s = load();
  return { freshness: freshness(scenario), cases: filter(scenario === "empty" ? [] : s.cases), ref };
}

export type InvestigationResult = {
  freshness: Freshness;
  detail: InvestigationDetail;
  /** Persisted cases only: AI-extracted candidates for the linked signals. */
  ai?: AiPanelData;
  actionDigests?: Record<string, string>;
};

/** Linked signals and events read for one persisted case. */
const MAX_DETAIL_SIGNALS = 20;

async function persistedDetail(rt: Runtime, id: string): Promise<InvestigationResult> {
  let result: InvestigationResult | null;
  try {
    const record = await rt.investigations.getCase(rt.tenantId, id);
    if (record) {
      const ids = record.links.map((l) => l.signalId).slice(0, MAX_DETAIL_SIGNALS);
      const signals = (await Promise.all(ids.map((sid) => rt.repo.getSignal(rt.tenantId, sid)))).filter((x) => x !== null);
      const batches = await Promise.all(
        [...new Set(signals.map((x) => x.correlationId))].map((correlationId) => rt.repo.listEvents(rt.tenantId, { limit: 200, correlationId })),
      );
      const events = sortEventsNewestFirst([...new Map(batches.flat().map((e) => [e.id, e])).values()]);
      const storedActions = await rt.governance.listActionsForCase(rt.tenantId, record.case.id);
      const detail = toInvestigationDetail(record, signals, events);
      detail.actions = storedActions.map(toProposedAction);
      result = {
        freshness: persistedFreshness(rt.mode),
        detail: investigationDetailSchema.parse(detail),
        ai: await readAiPanel(rt, signals.map((x) => x.id)),
        actionDigests: Object.fromEntries(storedActions.map((a) => [a.id, a.parameterDigest])),
      };
    } else {
      result = null;
    }
  } catch (error) {
    readFailed(error);
  }
  // "Not found" means not found for this tenant in the configured store; fixture cases are not consulted.
  if (!result) throw new NotFoundError(`Investigation ${id} was not found.`);
  return result;
}

export async function getInvestigationDetail(id: string, scenario: Scenario = "ok"): Promise<InvestigationResult> {
  const rt = await openStore();
  if (rt) return persistedDetail(rt, id);
  gate(scenario);
  const s = load();
  const c = scenario === "empty" ? undefined : s.cases.find((x) => x.id === id);
  if (!c) throw new NotFoundError(`Investigation ${id} was not found.`);
  const fresh = freshness(scenario);
  if (id === "INV-2041") return { freshness: fresh, detail: s.detail2041 };
  return {
    freshness: fresh,
    detail: {
      case: c,
      detailAvailable: false,
      sourceSignal: s.signals.find((sig) => sig.caseId === id) ?? null,
      evidence: [],
      claims: [],
      impact: null,
      unknowns: [],
      conflicts: [],
      entities: { nodes: [], edges: [] },
      actions: [],
      events: s.events.filter((e) => e.caseId === id),
      audit: [],
    },
  };
}

export type ActivityData = {
  freshness: Freshness;
  events: InvestigationEvent[];
  stages: StageSummary;
  signals: SignalRecord[];
  /** `recorded replay`: fixtures. `persisted snapshot`: events read from the store at load time. */
  mode: "recorded replay" | "persisted snapshot";
  /** Persisted modes only: AI-extracted candidates for the listed signals. null for fixtures. */
  ai: AiPanelData | null;
};

export async function getActivityData(scenario: Scenario = "ok"): Promise<ActivityData> {
  const rt = await openStore();
  if (rt) {
    const persisted = await readPersisted(rt, { signals: 200, events: 500 });
    const events = sortEventsNewestFirst(persisted.events);
    let ai: AiPanelData;
    try {
      ai = await readAiPanel(rt, persisted.signals.map((x) => x.id));
    } catch (error) {
      readFailed(error);
    }
    return {
      freshness: persistedFreshness(rt.mode),
      events,
      stages: summarizeStages(events),
      signals: persisted.signals,
      mode: "persisted snapshot",
      ai,
    };
  }
  gate(scenario);
  const s = load();
  const events = scenario === "empty" ? [] : sortEventsNewestFirst(s.events);
  return {
    freshness: freshness(scenario),
    events,
    stages: summarizeStages(events),
    signals: scenario === "empty" ? [] : s.signals.map(signalToRecord),
    mode: "recorded replay",
    ai: null,
  };
}

export type SubmitAvailability = { enabled: boolean; reason: string | null };

/**
 * Whether "Open investigation" / "Re-run investigation" may be offered. The server actions re-check this
 * and still require a signed-in session.
 */
export function getOperatorAvailability(): SubmitAvailability {
  try {
    const env = getEnv();
    if (env.DATA_SOURCE === "fixtures") {
      return { enabled: false, reason: "Operator actions need DATA_SOURCE=memory or database." };
    }
    if (!env.ENABLE_OPERATOR_ACTIONS) {
      return { enabled: false, reason: "Operator actions are turned off. Set ENABLE_OPERATOR_ACTIONS=true to enable them." };
    }
    return { enabled: true, reason: null };
  } catch {
    return { enabled: false, reason: "The server configuration is invalid, so operator actions are unavailable." };
  }
}

/** Whether the synthetic-submit form may be offered. The server action re-checks this; hiding is not security. */
export function getSubmitAvailability(): SubmitAvailability {
  try {
    const env = getEnv();
    if (env.DATA_SOURCE === "fixtures") {
      return { enabled: false, reason: "Submitting needs DATA_SOURCE=memory or database. The app is reading recorded fixtures." };
    }
    if (!env.ENABLE_SYNTHETIC_SUBMIT) {
      return { enabled: false, reason: "Synthetic submission is turned off. Set ENABLE_SYNTHETIC_SUBMIT=true to enable it." };
    }
    return { enabled: true, reason: null };
  } catch {
    return { enabled: false, reason: "The server configuration is invalid, so submission is unavailable." };
  }
}
