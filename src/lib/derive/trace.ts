import { STAGES, type EventStatus, type EventType, type InvestigationEvent, type Stage } from "@/lib/domain";
import { dedupeEvents, sortEventsOldestFirst } from "./index";

/**
 * Pure derivations for the Live Activity views. Everything here is computed from recorded events;
 * nothing is inferred about stages that have no event.
 */

export type EventFilters = {
  status: EventStatus | "all";
  stage: Stage | "all";
  type: EventType | "all";
  caseId: string | "all";
};

export const NO_FILTERS: EventFilters = { status: "all", stage: "all", type: "all", caseId: "all" };

export function isFiltering(f: EventFilters): boolean {
  return f.status !== "all" || f.stage !== "all" || f.type !== "all" || f.caseId !== "all";
}

export function filterEvents(events: readonly InvestigationEvent[], f: EventFilters): InvestigationEvent[] {
  return events.filter(
    (e) =>
      (f.status === "all" || e.status === f.status) &&
      (f.stage === "all" || e.stage === f.stage) &&
      (f.type === "all" || e.type === f.type) &&
      (f.caseId === "all" || e.caseId === f.caseId),
  );
}

export type TraceStep =
  | {
      kind: "recorded";
      stage: Stage;
      events: InvestigationEvent[];
      /** Time between the previous recorded step's last event and this step's first event. null for the first step. */
      gapFromPreviousMs: number | null;
    }
  | { kind: "missing"; stage: Stage };

export type SignalTrace = {
  correlationId: string;
  eventCount: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Wall-clock span of recorded events; not the sum of stage durations. */
  spanMs: number | null;
  steps: TraceStep[];
  caseIds: string[];
  signalId: string | null;
};

/**
 * Builds the per-stage trace for one correlation id. Stages with no recorded event are returned
 * as `missing` so the UI can say "No event recorded" instead of implying the stage ran or was skipped.
 */
export function buildTrace(correlationId: string, events: readonly InvestigationEvent[]): SignalTrace {
  const mine = sortEventsOldestFirst(dedupeEvents(events.filter((e) => e.correlationId === correlationId)));
  const byStage = new Map<Stage, InvestigationEvent[]>();
  for (const e of mine) {
    const list = byStage.get(e.stage) ?? [];
    list.push(e);
    byStage.set(e.stage, list);
  }

  let previousLast: string | null = null;
  const steps: TraceStep[] = STAGES.map((stage): TraceStep => {
    const list = byStage.get(stage);
    if (!list || list.length === 0) return { kind: "missing", stage };
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return { kind: "missing", stage };
    const gap = previousLast === null ? null : Math.max(0, Date.parse(first.occurredAt) - Date.parse(previousLast));
    previousLast = last.occurredAt;
    return { kind: "recorded", stage, events: list, gapFromPreviousMs: gap };
  });

  const firstAt = mine[0]?.occurredAt ?? null;
  const lastAt = mine[mine.length - 1]?.occurredAt ?? null;
  return {
    correlationId,
    eventCount: mine.length,
    firstAt,
    lastAt,
    spanMs: firstAt && lastAt ? Date.parse(lastAt) - Date.parse(firstAt) : null,
    steps,
    caseIds: [...new Set(mine.map((e) => e.caseId).filter((c): c is string => c !== null))],
    signalId: mine.find((e) => e.signalId !== null)?.signalId ?? null,
  };
}

/**
 * Merge for a paused view. While paused the visible list is frozen; events that arrive are counted
 * and shown only on resume. Duplicate deliveries (same id) are ignored.
 */
export function holdEvents(
  frozen: readonly InvestigationEvent[],
  incoming: readonly InvestigationEvent[],
): { pending: number } {
  const known = new Set(frozen.map((e) => e.id));
  const fresh = new Set(incoming.filter((e) => !known.has(e.id)).map((e) => e.id));
  return { pending: fresh.size };
}
