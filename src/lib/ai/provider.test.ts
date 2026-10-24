import { describe, expect, it, vi } from "vitest";
import { createAiConfig } from "./config";
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_PROMPT_VERSION, SOURCE_BEGIN, SOURCE_END } from "./extraction-schema";
import { MockProvider, mockExtract } from "./mock";
import { isLoopbackUrl, OllamaProvider } from "./ollama";
import { AiOutputError, AiTimeoutError, AiUnavailableError, type GenerateJsonRequest } from "./provider";

const request = (overrides: Partial<GenerateJsonRequest> = {}): GenerateJsonRequest => ({
  task: EXTRACTION_PROMPT_VERSION,
  system: "system",
  user: `${SOURCE_BEGIN}\nPO-77410: 8,000 m of navy twill NV-4410 will arrive four days late.\n${SOURCE_END}`,
  jsonSchema: EXTRACTION_JSON_SCHEMA,
  maxOutputTokens: 400,
  signal: new AbortController().signal,
  ...overrides,
});

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, ...init });

describe("isLoopbackUrl", () => {
  it.each([
    ["http://127.0.0.1:11434", true],
    ["http://localhost:11434", true],
    ["http://[::1]:11434", true],
    ["http://127.0.0.2:11434", true],
    ["http://192.168.0.10:11434", false],
    ["https://api.example.com", false],
    ["http://localhost.example.com", false],
    ["http://user:pw@127.0.0.1:11434", false],
    ["file:///etc/passwd", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => expect(isLoopbackUrl(url)).toBe(expected));
});

describe("OllamaProvider", () => {
  it("refuses a non-loopback base URL", () => {
    expect(() => new OllamaProvider("https://ollama.example.com", "qwen2.5:3b")).toThrow(/loopback/);
  });

  it("sends a non-streaming, schema-constrained, temperature-0 chat request and reads token counts", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: { role: "assistant", content: '{"delayDays":null}' }, prompt_eval_count: 120, eval_count: 9 }),
    );
    const provider = new OllamaProvider("http://127.0.0.1:11434", "qwen2.5:3b", fetchImpl as unknown as typeof fetch);
    const res = await provider.generateJson(request());
    expect(res).toEqual({ text: '{"delayDays":null}', usage: { inputTokens: 120, outputTokens: 9 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "qwen2.5:3b",
      stream: false,
      format: EXTRACTION_JSON_SCHEMA,
      options: { temperature: 0, num_predict: 400 },
    });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(init.redirect).toBe("error");
  });

  it("maps an aborted request to a timeout", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const provider = new OllamaProvider("http://127.0.0.1:11434", "m", fetchImpl as unknown as typeof fetch);
    await expect(provider.generateJson(request({ signal: controller.signal }))).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("maps connection errors and HTTP errors to unavailable", async () => {
    const refused = new OllamaProvider("http://127.0.0.1:11434", "m", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(refused.generateJson(request())).rejects.toBeInstanceOf(AiUnavailableError);
    const missingModel = new OllamaProvider("http://127.0.0.1:11434", "m", (async () =>
      jsonResponse({ error: "model not found" }, { status: 404 })) as unknown as typeof fetch);
    await expect(missingModel.generateJson(request())).rejects.toThrow("http_404");
  });

  it("rejects oversized and malformed responses", async () => {
    const big = new OllamaProvider("http://127.0.0.1:11434", "m", (async () =>
      jsonResponse({ message: { content: "x".repeat(9000) } })) as unknown as typeof fetch);
    await expect(big.generateJson(request())).rejects.toBeInstanceOf(AiOutputError);
    const huge = new OllamaProvider("http://127.0.0.1:11434", "m", (async () =>
      jsonResponse("y".repeat(40_000))) as unknown as typeof fetch);
    await expect(huge.generateJson(request())).rejects.toThrow("response_too_large");
    const notJson = new OllamaProvider("http://127.0.0.1:11434", "m", (async () =>
      jsonResponse("<html>")) as unknown as typeof fetch);
    await expect(notJson.generateJson(request())).rejects.toThrow("envelope_not_json");
    const noContent = new OllamaProvider("http://127.0.0.1:11434", "m", (async () =>
      jsonResponse({ message: {} })) as unknown as typeof fetch);
    await expect(noContent.generateJson(request())).rejects.toThrow("missing_content");
  });
});

describe("MockProvider", () => {
  it("is deterministic and labelled as not a model", async () => {
    const mock = new MockProvider();
    expect(mock.label).toMatch(/not a model/);
    const a = await mock.generateJson(request());
    const b = await mock.generateJson(request());
    expect(a.text).toBe(b.text);
    expect(JSON.parse(a.text)).toMatchObject({
      delayDays: { value: 4, quote: "four days" },
      quantity: { value: 8000, quote: "8,000 m" },
      unit: { value: "m" },
      purchaseOrder: { value: "PO-77410" },
      material: { value: "NV-4410" },
      shipment: null,
    });
  });

  it("refuses tasks it does not implement", async () => {
    await expect(new MockProvider().generateJson(request({ task: "other.v1" }))).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("extracts lots, shipments and production orders, and no delay without delay language", () => {
    const out = mockExtract("Inspection failed: woven label lot WL-3301 for PRD-5106, 1,500 pcs. Shipment SHP-30871 on hold.");
    expect(out.lot?.value).toBe("WL-3301");
    expect(out.productionOrder?.value).toBe("PRD-5106");
    expect(out.shipment?.value).toBe("SHP-30871");
    expect(out.quantity?.value).toBe(1500);
    expect(out.unit?.value).toBe("pcs");
    expect(out.delayDays).toBeNull();
  });
});

describe("createAiConfig", () => {
  const env = { OLLAMA_BASE_URL: "http://127.0.0.1:11434", AI_TIMEOUT_MS: 15000, AI_MAX_RETRIES: 1 } as const;

  it("builds exactly the configured provider", () => {
    expect(createAiConfig({ ...env, AI_PROVIDER: "none" }).provider).toBeNull();
    expect(createAiConfig({ ...env, AI_PROVIDER: "mock" }).provider?.kind).toBe("mock");
    const ollama = createAiConfig({ ...env, AI_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5:3b" });
    expect(ollama.provider?.kind).toBe("ollama");
    expect(ollama.provider?.model).toBe("qwen2.5:3b");
  });

  it("fails instead of substituting another provider", () => {
    expect(() => createAiConfig({ ...env, AI_PROVIDER: "ollama" })).toThrow(/OLLAMA_MODEL/);
    expect(() =>
      createAiConfig({ ...env, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "https://remote.example.com" }),
    ).toThrow(/loopback/);
  });
});
