/**
 * Replaceable model provider boundary (AGENTS.md 8.2). The domain layer only sees this interface; provider
 * specifics stay in the adapters. Output is untrusted text: callers must validate it.
 */
export type ProviderKind = "mock" | "ollama";

export interface GenerateJsonRequest {
  /** Task and prompt version, e.g. `signal-extraction.v1`. The mock provider dispatches on it. */
  task: string;
  system: string;
  user: string;
  /** JSON schema the output should follow. Adapters may pass it to the model; it is not trusted to hold. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface GenerateJsonResponse {
  text: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface AiProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  /** Human-readable label for the UI, e.g. "mock provider (deterministic, not a model)". */
  readonly label: string;
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse>;
}

/** The provider could not be reached or refused the request. Not retried. */
export class AiUnavailableError extends Error {}
/** The request exceeded its time budget. May be retried within the configured bound. */
export class AiTimeoutError extends Error {}
/** The provider answered, but not with usable output (non-JSON body, oversized, wrong shape). */
export class AiOutputError extends Error {}

/** Hard cap on the text a provider may return. Larger responses are rejected, not truncated. */
export const MAX_OUTPUT_BYTES = 8 * 1024;
