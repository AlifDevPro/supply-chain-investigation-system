import "server-only";
import { z } from "zod";
import { isLoopbackUrl } from "@/lib/ai/ollama";

/**
 * Server-only configuration (AGENTS.md 19). Validated once; a misconfiguration fails clearly instead of
 * silently changing behavior. Nothing here is exposed to the browser: no variable has a NEXT_PUBLIC_ prefix.
 */
const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

const envSchema = z
  .object({
    DATA_SOURCE: z.enum(["fixtures", "memory", "database"]).default("fixtures"),
    DATABASE_URL: z.string().min(1).optional(),
    INGEST_API_KEY: z.string().min(24, "INGEST_API_KEY must be at least 24 characters").optional(),
    DEMO_TENANT_ID: z.string().min(1).default("tenant-demo"),
    ENABLE_SYNTHETIC_SUBMIT: flag,
    /** Shows "Open investigation" / "Re-run investigation". Still requires a signed-in session. */
    ENABLE_OPERATOR_ACTIONS: flag,
    /** HMAC key for the signed session cookie. Required to sign in. Never expose to the browser. */
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional(),
    DEMO_REVIEWER_PASSWORD: z.string().min(8).optional(),
    DEMO_PROCUREMENT_PASSWORD: z.string().min(8).optional(),
    DEMO_MANAGER_PASSWORD: z.string().min(8).optional(),
    /** Optional Google OAuth client. Both must be set together. Never expose the secret to the browser. */
    GOOGLE_CLIENT_ID: z.string().min(10).max(200).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(10).max(200).optional(),
    /** Optional pool size (1-20). Lower it if the database pooler limits client connections. */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    /** AI fact extraction. `none` is an explicit "AI off" state; there is no remote provider. */
    AI_PROVIDER: z.enum(["none", "mock", "ollama"]).default("none"),
    OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
    OLLAMA_MODEL: z.string().trim().min(1).max(100).optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.DATA_SOURCE === "database" && !env.DATABASE_URL) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "DATABASE_URL is required when DATA_SOURCE=database" });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set, or both left blank",
      });
    }
    if (env.AI_PROVIDER === "ollama") {
      if (!env.OLLAMA_MODEL) {
        ctx.addIssue({ code: "custom", path: ["OLLAMA_MODEL"], message: "OLLAMA_MODEL is required when AI_PROVIDER=ollama" });
      }
      if (!isLoopbackUrl(env.OLLAMA_BASE_URL)) {
        ctx.addIssue({
          code: "custom",
          path: ["OLLAMA_BASE_URL"],
          message: "OLLAMA_BASE_URL must be a loopback address (localhost, 127.0.0.1 or [::1]); remote inference is not allowed",
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export class EnvError extends Error {}

/** Parses an env object. Messages name the variable but never echo its value. */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v);
  const result = envSchema.safeParse({
    DATA_SOURCE: blank(source.DATA_SOURCE),
    DATABASE_URL: blank(source.DATABASE_URL),
    INGEST_API_KEY: blank(source.INGEST_API_KEY),
    DEMO_TENANT_ID: blank(source.DEMO_TENANT_ID),
    ENABLE_SYNTHETIC_SUBMIT: blank(source.ENABLE_SYNTHETIC_SUBMIT),
    ENABLE_OPERATOR_ACTIONS: blank(source.ENABLE_OPERATOR_ACTIONS),
    DATABASE_POOL_MAX: blank(source.DATABASE_POOL_MAX),
    AI_PROVIDER: blank(source.AI_PROVIDER),
    OLLAMA_BASE_URL: blank(source.OLLAMA_BASE_URL),
    OLLAMA_MODEL: blank(source.OLLAMA_MODEL),
    AI_TIMEOUT_MS: blank(source.AI_TIMEOUT_MS),
    AI_MAX_RETRIES: blank(source.AI_MAX_RETRIES),
    SESSION_SECRET: blank(source.SESSION_SECRET),
    DEMO_REVIEWER_PASSWORD: blank(source.DEMO_REVIEWER_PASSWORD),
    DEMO_PROCUREMENT_PASSWORD: blank(source.DEMO_PROCUREMENT_PASSWORD),
    DEMO_MANAGER_PASSWORD: blank(source.DEMO_MANAGER_PASSWORD),
    GOOGLE_CLIENT_ID: blank(source.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: blank(source.GOOGLE_CLIENT_SECRET),
  });
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration. ${problems.join("; ")}`);
  }
  if (result.data.DATA_SOURCE === "memory" && process.env.NODE_ENV === "production") {
    throw new EnvError("DATA_SOURCE=memory is a development mode and is not allowed in production.");
  }
  return result.data;
}

let cached: AppEnv | undefined;
export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
