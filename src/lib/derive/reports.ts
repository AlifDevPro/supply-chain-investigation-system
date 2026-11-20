import type { StoredExtraction } from "@/lib/store/extraction-types";
import { caseStateSchema, type CaseState, type InvestigationCase, type InvestigationEvent, type SignalRecord, type SourceType } from "@/lib/domain";

const LIFECYCLE_ORDER: readonly CaseState[] = caseStateSchema.options;

export const REPORT_WINDOWS = ["24h", "7d", "all"] as const;
export type ReportWindow = (typeof REPORT_WINDOWS)[number];

export interface NamedCount {
  key: string;
  label: string;
  count: number;
}

export interface Rate {
  numerator: number;
  denominator: number;
  /** null when the denominator is 0: the rate is not measured. */
  rate: number | null;
}

export interface CaseFindings {
  unknowns: number;
  conflicts: number;
}

export interface ReportMetrics {
  window: ReportWindow;
  windowLabel: string;
  signalsInWindow: number;
  volumeBySourceType: NamedCount[];
  duplicateRate: Rate;
  triageMix: NamedCount[];
  heldBacklog: { count: number; oldestAgeHours: number | null };
  casesByState: NamedCount[];
  /** Cases whose openedAt falls inside the selected window. */
  investigationThroughput: number;
  impactSplit: { verified: number; provisional: number; incalculable: number; none: number };
  unknowns: { total: number; cases: number; average: number | null };
  conflicts: { total: number; cases: number; average: number | null };
  failuresByClass: NamedCount[];
  extractionStatus: NamedCount[];
  rulesAgreement: Rate;
  measuredLatency: { samples: number; medianMs: number | null };
  verifiedOutcomes: number;
  /**
   * outcome.verified events in window ÷ action.execution_completed events in window.
   * null when there were no completed executions to verify (not measured).
   */
  verificationRate: Rate;
};

export const WINDOW_LABEL: Record<ReportWindow, string> = {
  "24h": "Last 24 hours (from the page load time)",
  "7d": "Last 7 days (from the page load time)",
  all: "All stored records (no rolling window)",
};

export function parseReportWindow(value: string | string[] | undefined): ReportWindow {
  const v = Array.isArray(value) ? value[0] : value;
  return (REPORT_WINDOWS as readonly string[]).includes(v ?? "") ? (v as ReportWindow) : "all";
}

export function windowCutoff(window: ReportWindow, now: Date): Date | null {
  if (window === "all") return null;
  const ms = window === "24h" ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
  return new Date(now.getTime() - ms);
}

function inWindow(iso: string, cutoff: Date | null): boolean {
  if (!cutoff) return true;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= cutoff.getTime();
}

function counts(entries: Array<[string, string]>): NamedCount[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const [key, label] of entries) {
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { label, count: 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.key.localeCompare(b.key)));
}

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const SOURCE_LABEL: Record<SourceType, string> = {
  supplier_email: "Supplier email",
  erp_purchase_order: "ERP purchase order",
  inventory_balance: "Inventory balance",
  inventory_reservation: "Inventory reservation",
  production_order: "Production order",
  shipment: "Shipment",
  quality_record: "Quality record",
  manual_report: "Manual report",
};

/**
 * Report figures from stored records. A rate or average is `null` ("not measured") when its
 * denominator is zero. Latency uses only events that recorded `durationMs`.
 */
export function computeReportMetrics(input: {
  window: ReportWindow;
  now: Date;
  signals: readonly SignalRecord[];
  events: readonly InvestigationEvent[];
  cases: readonly InvestigationCase[];
  findings: readonly CaseFindings[];
  extractions: readonly StoredExtraction[];
}): ReportMetrics {
  const cutoff = windowCutoff(input.window, input.now);
  const signals = input.signals.filter((s) => inWindow(s.receivedAt, cutoff));
  const events = input.events.filter((e) => inWindow(e.occurredAt, cutoff));
  const extractions = input.extractions.filter((x) => inWindow(x.createdAt, cutoff));
  const held = input.signals.filter((s) => s.processingStatus === "held_for_review");
  const oldestHeld = held.reduce<number | null>((min, s) => {
    const t = Date.parse(s.receivedAt);
    if (!Number.isFinite(t)) return min;
    const age = Math.max(0, Math.round((input.now.getTime() - t) / 3_600_000));
    return min === null || age > min ? age : min;
  }, null);

  const accepted = signals.filter((s) => s.processingStatus !== "rejected");
  const duplicates = accepted.filter((s) => s.processingStatus === "duplicate");
  const triaged = signals.filter((s) => s.triageOutcome);
  const compared = extractions.flatMap((x) => x.comparison);
  const agrees = compared.filter((c) => c.result === "agrees");
  const latencies = events.map((e) => e.durationMs).filter((n): n is number => n !== null);
  const unknownTotal = input.findings.reduce((n, f) => n + f.unknowns, 0);
  const conflictTotal = input.findings.reduce((n, f) => n + f.conflicts, 0);
  const findingsCases = input.findings.length;

  const impactSplit = { verified: 0, provisional: 0, incalculable: 0, none: 0 };
  for (const c of input.cases) {
    if (c.impactStatus === "verified") impactSplit.verified += 1;
    else if (c.impactStatus === "provisional") impactSplit.provisional += 1;
    else if (c.impactStatus === "incalculable") impactSplit.incalculable += 1;
    else impactSplit.none += 1;
  }

  const stateCounts = new Map<CaseState, number>();
  for (const c of input.cases) stateCounts.set(c.state, (stateCounts.get(c.state) ?? 0) + 1);

  const casesOpened = input.cases.filter((c) => inWindow(c.openedAt, cutoff)).length;
  const verifiedOutcomes = events.filter((e) => e.type === "outcome.verified").length;
  const executionsCompleted = events.filter((e) => e.type === "action.execution_completed").length;

  return {
    window: input.window,
    windowLabel: WINDOW_LABEL[input.window],
    signalsInWindow: signals.length,
    volumeBySourceType: counts(signals.filter((s) => s.sourceType).map((s) => [s.sourceType!, SOURCE_LABEL[s.sourceType!]])),
    duplicateRate: rate(duplicates.length, accepted.length),
    triageMix: counts(triaged.map((s) => [s.triageOutcome!, s.triageOutcome!.replaceAll("_", " ")])),
    heldBacklog: { count: held.length, oldestAgeHours: held.length === 0 ? null : oldestHeld },
    casesByState: LIFECYCLE_ORDER.filter((s) => (stateCounts.get(s) ?? 0) > 0).map((state) => ({
      key: state, label: state.replaceAll("_", " "), count: stateCounts.get(state)!,
    })),
    investigationThroughput: casesOpened,
    impactSplit,
    unknowns: { total: unknownTotal, cases: findingsCases, average: findingsCases === 0 ? null : unknownTotal / findingsCases },
    conflicts: { total: conflictTotal, cases: findingsCases, average: findingsCases === 0 ? null : conflictTotal / findingsCases },
    failuresByClass: counts(events.filter((e) => e.errorClass).map((e) => [e.errorClass!, e.errorClass!.replaceAll("_", " ")])),
    extractionStatus: counts(extractions.map((x) => [x.status, x.status.replaceAll("_", " ")])),
    rulesAgreement: rate(agrees.length, compared.length),
    measuredLatency: { samples: latencies.length, medianMs: median(latencies) },
    verifiedOutcomes,
    verificationRate: rate(verifiedOutcomes, executionsCompleted),
  };
}

/** Human-readable source line for Reports. Always notes synthetic/demo data; distinguishes fixtures from a store. */
export function reportDataSourceLabel(mode: "fixtures" | "memory" | "database"): string {
  if (mode === "fixtures") {
    return "Synthetic fixture signals, events, cases and extractions. Not operational data.";
  }
  if (mode === "database") {
    return "Synthetic data in Supabase Postgres (signals, events, cases, extractions). Not operational data.";
  }
  return "Synthetic data in server memory (signals, events, cases, extractions; resets on restart). Not operational data.";
}
