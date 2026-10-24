import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to fixtures with submit disabled", () => {
    const env = parseEnv({});
    expect(env).toMatchObject({ DATA_SOURCE: "fixtures", ENABLE_SYNTHETIC_SUBMIT: false, DEMO_TENANT_ID: "tenant-demo" });
  });

  it("treats blank values as unset", () => {
    expect(parseEnv({ DATA_SOURCE: "", DATABASE_URL: "  ", INGEST_API_KEY: "" }).DATA_SOURCE).toBe("fixtures");
  });

  it("validates the optional pool size", () => {
    expect(parseEnv({}).DATABASE_POOL_MAX).toBe(5);
    expect(parseEnv({ DATABASE_POOL_MAX: "1" }).DATABASE_POOL_MAX).toBe(1);
    expect(() => parseEnv({ DATABASE_POOL_MAX: "0" })).toThrow(EnvError);
    expect(() => parseEnv({ DATABASE_POOL_MAX: "abc" })).toThrow(EnvError);
  });

  it("defaults AI to off and validates the AI settings", () => {
    expect(parseEnv({})).toMatchObject({ AI_PROVIDER: "none", AI_TIMEOUT_MS: 15000, AI_MAX_RETRIES: 1 });
    expect(parseEnv({ AI_PROVIDER: "mock" }).AI_PROVIDER).toBe("mock");
    expect(() => parseEnv({ AI_PROVIDER: "openai" })).toThrow(EnvError);
    expect(() => parseEnv({ AI_MAX_RETRIES: "3" })).toThrow(EnvError);
    expect(() => parseEnv({ AI_TIMEOUT_MS: "100" })).toThrow(EnvError);
  });

  it("requires a model and a loopback URL for Ollama", () => {
    expect(() => parseEnv({ AI_PROVIDER: "ollama" })).toThrow(/OLLAMA_MODEL/);
    expect(parseEnv({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5:3b" }).OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434");
    expect(() =>
      parseEnv({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "https://ollama.example.com" }),
    ).toThrow(/loopback/);
  });

  it("requires DATABASE_URL for the database source", () => {
    expect(() => parseEnv({ DATA_SOURCE: "database" })).toThrow(EnvError);
    expect(() => parseEnv({ GOOGLE_CLIENT_ID: "client-id-value" })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(parseEnv({ GOOGLE_CLIENT_ID: "client-id-value", GOOGLE_CLIENT_SECRET: "client-secret-value" }).GOOGLE_CLIENT_ID).toBe("client-id-value");
  });

  it("rejects a short ingest key and never echoes the value", () => {
    try {
      parseEnv({ INGEST_API_KEY: "short-secret" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as Error).message).toContain("INGEST_API_KEY");
      expect((error as Error).message).not.toContain("short-secret");
    }
  });

  it("rejects unknown data sources", () => {
    expect(() => parseEnv({ DATA_SOURCE: "sqlite" })).toThrow(EnvError);
  });
});
