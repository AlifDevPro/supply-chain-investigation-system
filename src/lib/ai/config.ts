import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import type { AiProvider } from "./provider";

export interface AiConfig {
  /** null when AI_PROVIDER=none: an explicit "AI off" state, never a silent substitute. */
  provider: AiProvider | null;
  timeoutMs: number;
  maxRetries: number;
}

export interface AiEnv {
  AI_PROVIDER: "none" | "mock" | "ollama";
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL?: string;
  AI_TIMEOUT_MS: number;
  AI_MAX_RETRIES: number;
}

/** Builds exactly the configured provider. There is no fallback from one provider to another. */
export function createAiConfig(env: AiEnv, fetchImpl: typeof fetch = fetch): AiConfig {
  const base = { timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES };
  switch (env.AI_PROVIDER) {
    case "none":
      return { ...base, provider: null };
    case "mock":
      return { ...base, provider: new MockProvider() };
    case "ollama":
      if (!env.OLLAMA_MODEL) throw new Error("OLLAMA_MODEL is required when AI_PROVIDER=ollama");
      return { ...base, provider: new OllamaProvider(env.OLLAMA_BASE_URL, env.OLLAMA_MODEL, fetchImpl) };
  }
}
