import { isLoopbackUrl } from "@/lib/ai/ollama";
import type { HttpStatusClass } from "@/lib/store/integration-types";

export const MAX_ADAPTER_BODY_BYTES = 16 * 1024;
export const ADAPTER_TIMEOUT_MS = 8_000;

export type { HttpStatusClass };

export class AdapterFetchError extends Error {
  constructor(
    readonly httpStatusClass: HttpStatusClass,
    readonly errorClass: "source_unavailable" | "timeout" | "validation_error" | "authorization_denied",
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "AdapterFetchError";
  }
}

function classifyStatus(status: number): HttpStatusClass {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  return "5xx";
}

/** HTTPS (or loopback HTTP) GET with bearer key, redirect refuse, body cap, timeout. Never logs the key. */
export async function fetchAdapterJson(params: {
  baseUrl: string;
  path: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<{ body: unknown; status: number; statusClass: HttpStatusClass }> {
  let url: URL;
  try {
    url = new URL(params.path, params.baseUrl.endsWith("/") ? params.baseUrl : `${params.baseUrl}/`);
  } catch {
    throw new AdapterFetchError("network", "validation_error", "Invalid connector URL.");
  }
  const https = url.protocol === "https:";
  const httpLoopback = url.protocol === "http:" && isLoopbackUrl(url.toString());
  if (!https && !httpLoopback) {
    throw new AdapterFetchError("network", "validation_error", "Connector URL must be https or loopback http.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? ADAPTER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${params.apiKey}`,
      },
    });
    const statusClass = classifyStatus(response.status);
    if (response.status === 401 || response.status === 403) {
      throw new AdapterFetchError(statusClass, "authorization_denied", "Connector rejected the API key.", response.status);
    }
    if (!response.ok) {
      throw new AdapterFetchError(statusClass, "source_unavailable", `Connector returned HTTP ${response.status}.`, response.status);
    }
    const text = await readCapped(response, MAX_ADAPTER_BODY_BYTES);
    if (text === null) {
      throw new AdapterFetchError("2xx", "validation_error", "Connector response exceeded the size limit.", response.status);
    }
    let body: unknown;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      throw new AdapterFetchError("2xx", "validation_error", "Connector response was not JSON.", response.status);
    }
    return { body, status: response.status, statusClass: "2xx" };
  } catch (error) {
    if (error instanceof AdapterFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AdapterFetchError("network", "timeout", "Connector request timed out.");
    }
    throw new AdapterFetchError("network", "source_unavailable", "Connector was unreachable.");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, limit: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
