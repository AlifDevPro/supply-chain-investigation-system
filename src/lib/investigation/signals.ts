import type { SourceType } from "@/lib/domain";
import type { TriageResult } from "@/lib/domain/processing";
import type { NormalizedSignal, ReferenceKey } from "@/lib/domain/signal-input";
import type { StoredSignal } from "@/lib/store/types";

/** The parts of a stored signal an investigation may use. Signal text is data, never instructions. */
export interface CaseSignal {
  id: string;
  receivedAt: string;
  sourceType: SourceType;
  sourceSystem: string;
  sourceRecordId: string | null;
  normalized: NormalizedSignal;
  triage: TriageResult | null;
}

export function toCaseSignal(s: StoredSignal): CaseSignal | null {
  if (!s.normalized || !s.sourceType || !s.sourceSystem) return null;
  return {
    id: s.id,
    receivedAt: s.receivedAt,
    sourceType: s.sourceType,
    sourceSystem: s.sourceSystem,
    sourceRecordId: s.sourceRecordId,
    normalized: s.normalized,
    triage: s.triage,
  };
}

export type ReferenceSet = Partial<Record<ReferenceKey, string>>;

/** First non-null value per reference key, newest signal first. */
export function mergeReferences(signals: readonly CaseSignal[]): ReferenceSet {
  const out: ReferenceSet = {};
  for (const s of signals) {
    for (const [key, value] of Object.entries(s.normalized.references) as Array<[ReferenceKey, string | null]>) {
      if (value && !out[key]) out[key] = value;
    }
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};

const DELAY_LENGTH =
  /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty)[\s-]*(day|days|week|weeks)\b/i;
const DELAY_CONTEXT = /\b(delay(?:s|ed)?|late|later|postpone(?:d)?|pushed back|slip(?:s|ped)?|behind)\b/i;

/** The first stated length in days ("two days", "4 days", "one week"), or null. No delay-language check. */
export function parseDelayLength(text: string): number | null {
  const m = DELAY_LENGTH.exec(text);
  if (!m || !m[1] || !m[2]) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
  if (n === undefined || n <= 0 || n > 365) return null;
  return m[2].toLowerCase().startsWith("week") ? n * 7 : n;
}

/** True when the text uses delay language ("delayed", "late", "pushed back", ...). */
export const hasDelayLanguage = (text: string) => DELAY_CONTEXT.test(text);

/**
 * Deterministic extraction of a stated delay length ("delayed two days", "4 days late", "one week later").
 * Returns null unless the text both states a length and uses delay language. Rule: `delay-length.v1`.
 */
export function extractReportedDelayDays(signal: CaseSignal): number | null {
  const text = `${signal.normalized.label} ${signal.normalized.excerpt ?? ""}`;
  if (!hasDelayLanguage(text)) return null;
  // Prefer a length stated in the excerpt (a later, more specific statement) over the label.
  for (const part of [signal.normalized.excerpt ?? "", signal.normalized.label]) {
    const n = parseDelayLength(part);
    if (n !== null) return n;
  }
  return null;
}
