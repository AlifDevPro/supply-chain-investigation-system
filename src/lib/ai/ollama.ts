import {
  AiOutputError,
  AiTimeoutError,
  AiUnavailableError,
  MAX_OUTPUT_BYTES,
  type AiProvider,
  type GenerateJsonRequest,
  type GenerateJsonResponse,
} from "./provider";

/** Ollama's response envelope is larger than the content it carries; both are capped. */
const MAX_ENVELOPE_BYTES = 32 * 1024;

/**
 * Local inference only (AGENTS.md 16, AI privacy): the base URL must point at this machine. A remote host is
 * refused rather than trusted, so signal text cannot leave the machine through a misconfigured URL.
 */
export function isLoopbackUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AiOutputError("response_too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

interface OllamaChatResponse {
  message?: { content?: unknown };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** Adapter for a local Ollama server (`POST /api/chat`, non-streaming, JSON-schema constrained output). */
export class OllamaProvider implements AiProvider {
  readonly kind = "ollama" as const;
  readonly label: string;

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!isLoopbackUrl(baseUrl)) throw new Error("OLLAMA_BASE_URL must be a loopback address");
    this.label = `local Ollama (${model})`;
  }

  async generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL("/api/chat", this.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: request.jsonSchema,
          options: { temperature: 0, num_predict: request.maxOutputTokens },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
        signal: request.signal,
        redirect: "error",
      });
    } catch (error) {
      if (isAbort(error) || request.signal.aborted) throw new AiTimeoutError("timeout");
      throw new AiUnavailableError("unreachable");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AiUnavailableError(`http_${response.status}`);
    }
    let raw: string;
    try {
      raw = await readCapped(response, MAX_ENVELOPE_BYTES);
    } catch (error) {
      if (isAbort(error) || request.signal.aborted) throw new AiTimeoutError("timeout");
      throw error;
    }
    let envelope: OllamaChatResponse;
    try {
      envelope = JSON.parse(raw) as OllamaChatResponse;
    } catch {
      throw new AiOutputError("envelope_not_json");
    }
    const text = envelope?.message?.content;
    if (typeof text !== "string") throw new AiOutputError("missing_content");
    if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES) throw new AiOutputError("response_too_large");
    return { text, usage: { inputTokens: count(envelope.prompt_eval_count), outputTokens: count(envelope.eval_count) } };
  }
}
