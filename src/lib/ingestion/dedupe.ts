import type { DedupeStatus } from "@/lib/domain/processing";
import type { NormalizedSignal } from "@/lib/domain/signal-input";

export const DEDUPE_VERSION = "dedupe.v1";
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_POSSIBLY_RELATED = 5;

/** The minimum of an earlier canonical signal needed to decide on deduplication. */
export interface SignalRef {
  id: string;
  contentHash: string;
  fingerprint: string;
  receivedAt: string;
  sourceRecordId: string | null;
}

/** Earlier canonical signals of ONE tenant, already narrowed by the repository. */
export interface DedupeCandidates {
  /** Same source system and source record id, any order. */
  sameRecord: SignalRef[];
  /** Same fingerprint, any order. Only consulted when the signal has no source record id. */
  sameFingerprint: SignalRef[];
  /** Share at least one reference value, any order. Used only for hints. */
  sharedReferences: SignalRef[];
}

export type DedupeRuleId =
  | "dedupe.v1/exact-record"
  | "dedupe.v1/revision"
  | "dedupe.v1/exact-fingerprint"
  | "dedupe.v1/unique";

export interface DedupeDecision {
  status: DedupeStatus;
  rule: DedupeRuleId;
  duplicateOf: string | null;
  revisionOf: string | null;
  /** Earlier signals that look related. A hint only; never causes a merge. */
  possiblyRelated: string[];
}

const byReceivedAsc = (a: SignalRef, b: SignalRef) =>
  a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id < b.id ? -1 : 1;

/** Pure implementation of docs/signal-ingestion.md "Deduplication: dedupe.v1". */
export function decideDedupe(
  signal: { normalized: NormalizedSignal; contentHash: string; fingerprint: string; now: Date },
  candidates: DedupeCandidates,
): DedupeDecision {
  const hint = (exclude: Array<string | null>): string[] =>
    candidates.sharedReferences
      .filter((c) => c.fingerprint !== signal.fingerprint && !exclude.includes(c.id))
      .sort((a, b) => byReceivedAsc(b, a))
      .slice(0, MAX_POSSIBLY_RELATED)
      .map((c) => c.id);

  if (signal.normalized.sourceRecordId !== null) {
    const sameContent = candidates.sameRecord.filter((c) => c.contentHash === signal.contentHash).sort(byReceivedAsc);
    const original = sameContent[0];
    if (original) {
      return {
        status: "duplicate",
        rule: "dedupe.v1/exact-record",
        duplicateOf: original.id,
        revisionOf: null,
        possiblyRelated: [],
      };
    }
    const latest = [...candidates.sameRecord].sort(byReceivedAsc).at(-1);
    if (latest) {
      return {
        status: "revision",
        rule: "dedupe.v1/revision",
        duplicateOf: null,
        revisionOf: latest.id,
        possiblyRelated: hint([latest.id]),
      };
    }
    return { status: "unique", rule: "dedupe.v1/unique", duplicateOf: null, revisionOf: null, possiblyRelated: hint([]) };
  }

  const windowStart = signal.now.getTime() - DEDUPE_WINDOW_MS;
  const inWindow = candidates.sameFingerprint
    .filter((c) => c.fingerprint === signal.fingerprint && new Date(c.receivedAt).getTime() >= windowStart)
    .sort(byReceivedAsc);
  const original = inWindow[0];
  if (original) {
    return {
      status: "duplicate",
      rule: "dedupe.v1/exact-fingerprint",
      duplicateOf: original.id,
      revisionOf: null,
      possiblyRelated: [],
    };
  }
  return { status: "unique", rule: "dedupe.v1/unique", duplicateOf: null, revisionOf: null, possiblyRelated: hint([]) };
}
