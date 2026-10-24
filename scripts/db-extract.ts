/**
 * Runs AI fact extraction (signal-extraction.v1) for stored SYNTHETIC signals that have no completed
 * extraction for the configured provider, model and prompt version, oldest first. Uses AI_PROVIDER from
 * .env.local (mock or a local Ollama model); never a remote provider. Failed extractions are retried on the
 * next run; completed ones are not repeated. Results never change cases or calculations.
 * Run: npm run db:extract -- --backfill [--limit N]
 */
import { createAiConfig } from "@/lib/ai/config";
import { createPostgresClient } from "@/lib/db/postgres-client";
import { EnvError, parseEnv } from "@/lib/env";
import { backfillExtractions } from "@/lib/investigation/extraction";
import { PostgresSignalRepository } from "@/lib/store/postgres";
import { PostgresExtractionRepository } from "@/lib/store/postgres-extractions";

function limitArg(): number {
  const i = process.argv.indexOf("--limit");
  if (i < 0) return 200;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    console.error("--limit must be an integer between 1 and 500");
    process.exit(2);
  }
  return n;
}

async function main() {
  if (!process.argv.includes("--backfill")) {
    console.error("Usage: npm run db:extract -- --backfill [--limit N]");
    process.exit(2);
  }
  const env = parseEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const ai = createAiConfig(env);
  if (!ai.provider) {
    console.error("AI_PROVIDER is none (AI off). Set AI_PROVIDER=mock or AI_PROVIDER=ollama to extract.");
    process.exit(1);
  }
  const tenantId = env.DEMO_TENANT_ID;
  const client = createPostgresClient(env.DATABASE_URL, { max: 1 });
  try {
    const signals = new PostgresSignalRepository(client);
    console.log(`Provider: ${ai.provider.label}. Timeout ${ai.timeoutMs} ms per attempt, up to ${1 + ai.maxRetries} attempt(s).`);
    const summary = await backfillExtractions(
      tenantId,
      { signals, extractions: new PostgresExtractionRepository(client), ai },
      { limit: limitArg() },
    );
    const counts = Object.entries(summary.byStatus).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`Examined ${summary.examined} signal(s) for tenant ${tenantId}: ${counts || "nothing to do"}.`);
    if (summary.byStatus.unavailable > 0) {
      console.log("The provider was unavailable; stopped early. Is Ollama running and the model pulled?");
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string } | null)?.code ?? "unknown";
  const hint = code === "42P01" ? " Tables are missing: run `npm run db:migrate` first." : "";
  // EnvError messages name the variable but never its value.
  const message = error instanceof EnvError ? ` ${error.message}` : "";
  console.error(`Extraction backfill failed (${error instanceof Error ? error.constructor.name : "Error"}, code ${code}).${hint}${message}`);
  process.exit(1);
});
