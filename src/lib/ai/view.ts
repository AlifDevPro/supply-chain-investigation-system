import type { ComparisonResult, ExtractionStatus, RejectionCode } from "./extract";
import type { ExtractionField } from "./extraction-schema";

/** What the UI receives about one stored extraction. Client-safe and serializable; no tenant id. */
export interface AiExtractionView {
  id: string;
  signalId: string;
  provider: "mock" | "ollama";
  model: string;
  promptVersion: string;
  status: ExtractionStatus;
  failure: string | null;
  fields: Array<{ field: ExtractionField; value: string | number; quote: string }>;
  rejected: Array<{ field: ExtractionField; code: RejectionCode }>;
  comparison: Array<{ field: ExtractionField; ai: string | number | null; rules: string | number | null; result: ComparisonResult }>;
  latencyMs: number;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface AiPanelData {
  /** The provider configured now, or null when AI_PROVIDER=none. A stored extraction may be from another one. */
  configured: { label: string } | null;
  /** Newest extraction per signal id. */
  bySignal: Record<string, AiExtractionView>;
}

export function providerLabel(provider: AiExtractionView["provider"], model: string): string {
  return provider === "mock" ? "mock provider (deterministic, not a model)" : `local Ollama (${model})`;
}
