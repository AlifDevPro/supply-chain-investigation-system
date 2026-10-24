/**
 * One SYNTHETIC extraction against the configured AI_PROVIDER, to check that a local model is reachable and
 * returns usable output. Needs no database. Prints status, latency and counts only, never model text.
 * Run: npm run ai:smoke
 */
import { createAiConfig } from "@/lib/ai/config";
import { extractSignalFacts } from "@/lib/ai/extract";
import { EnvError, parseEnv } from "@/lib/env";
import { normalizeSignal } from "@/lib/ingestion/normalize";

async function main() {
  const env = parseEnv(process.env);
  const ai = createAiConfig(env);
  if (!ai.provider) {
    console.error("AI_PROVIDER is none (AI off). Set AI_PROVIDER=mock or AI_PROVIDER=ollama with OLLAMA_MODEL.");
    process.exit(1);
  }
  const normalized = normalizeSignal({
    sourceType: "supplier_email",
    sourceSystem: "Smoke test (synthetic)",
    label: "Supplier notice: navy twill NV-4410 for PO-77410 will arrive four days late",
    excerpt: "8,000 m of navy twill will arrive four days later than promised.",
    references: { purchaseOrder: "PO-77410", material: "NV-4410" },
    quantity: { value: 8000, unit: "m" },
    dataMode: "synthetic",
  });
  const out = await extractSignalFacts(
    {
      id: "SMOKE-1", receivedAt: new Date().toISOString(), sourceType: normalized.sourceType, sourceSystem: normalized.sourceSystem,
      sourceRecordId: null, normalized, triage: null,
    },
    { ...ai, provider: ai.provider },
  );
  const tally = (r: string) => out.comparison.filter((c) => c.result === r).length;
  console.log(`Provider: ${ai.provider.label}`);
  console.log(`Status: ${out.status}${out.failure ? ` (${out.failure})` : ""}; attempts ${out.attempts}; latency ${out.latencyMs} ms`);
  console.log(`Tokens: input ${out.inputTokens ?? "n/a"}, output ${out.outputTokens ?? "n/a"}`);
  console.log(`Fields kept ${out.fields.length}, rejected ${out.rejected.length} (${out.rejected.map((r) => `${r.field}:${r.code}`).join(", ") || "none"})`);
  console.log(`Against rules: agrees ${tally("agrees")}, differs ${tally("differs")}, AI only ${tally("ai_only")}, rules only ${tally("rules_only")}`);
  if (out.status !== "completed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof EnvError ? ` ${error.message}` : "";
  console.error(`Smoke test failed (${error instanceof Error ? error.constructor.name : "Error"}).${message}`);
  process.exit(1);
});
