import type { InvestigationCase, Severity, SignalRecord } from "@/lib/domain";

const REVIEW_STATES = ["needs_review", "awaiting_approval"] as const;
const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export type QueueKind = "held_signal" | "case";

export interface ReviewQueueItem {
  id: string;
  kind: QueueKind;
  title: string;
  reason: string;
  severity: Severity | null;
  at: string;
  ageHours: number | null;
  nextStep: string;
  caseId: string | null;
  signalId: string | null;
}

function hoursBetween(from: string, now: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(now);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 3_600_000));
}

function signalSeverity(s: SignalRecord): Severity | null {
  if (s.triageOutcome === "high_impact") return "high";
  if (s.triageOutcome === "uncertain") return "medium";
  return null;
}

/**
 * Items a person should look at: held signals that have no case, and cases waiting for a review
 * or approval. Sorted by severity (highest first), then oldest first. Signals without a severity
 * rank last.
 */
export function buildReviewQueue(
  signals: readonly SignalRecord[],
  cases: readonly InvestigationCase[],
  now: string,
  closedSignalIds: ReadonlySet<string> = new Set(),
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];
  for (const s of signals) {
    if (s.processingStatus !== "held_for_review" || s.caseId || closedSignalIds.has(s.id)) continue;
    items.push({
      id: s.id,
      kind: "held_signal",
      title: s.label ?? "Held signal (no stored label)",
      reason: s.triageOutcome === "uncertain" ? "Triage could not decide; the signal was kept." : "Triage marked this signal for review.",
      severity: signalSeverity(s),
      at: s.receivedAt,
      ageHours: hoursBetween(s.receivedAt, now),
      nextStep: "Open an investigation or leave it held.",
      caseId: null,
      signalId: s.id,
    });
  }
  for (const c of cases) {
    if (!(REVIEW_STATES as readonly string[]).includes(c.state)) continue;
    items.push({
      id: c.id,
      kind: "case",
      title: c.title,
      reason: c.reviewReason ?? (c.state === "awaiting_approval" ? "Awaiting approval of a proposed action." : "Awaiting review."),
      severity: c.severity,
      at: c.updatedAt,
      ageHours: hoursBetween(c.updatedAt, now),
      nextStep: c.nextAction,
      caseId: c.id,
      signalId: null,
    });
  }
  return items.sort((a, b) => {
    const sa = a.severity ? SEVERITY_RANK[a.severity] : 0;
    const sb = b.severity ? SEVERITY_RANK[b.severity] : 0;
    if (sa !== sb) return sb - sa;
    return a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id);
  });
}
