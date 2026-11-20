/**
 * Polls configured HTTPS connectors once. Run: npm run integrations:poll
 * Optional: npm run integrations:poll -- mailbox
 */
import { pollAllConnectors, pollConnector } from "@/lib/integrations/adapters";
import { EnvError, parseEnv } from "@/lib/env";
import { getRuntime, investigationDeps } from "@/lib/runtime";
import type { ConnectorId } from "@/lib/store/integration-types";

const IDS = new Set<ConnectorId>(["mailbox", "erp_po", "carrier"]);

async function main() {
  let env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    console.error(error instanceof EnvError ? error.message : "Invalid environment.");
    process.exit(1);
  }
  const runtime = await getRuntime();
  if (!runtime) {
    console.error("DATA_SOURCE=fixtures has no live store. Use memory or database.");
    process.exit(1);
  }
  const deps = {
    env,
    tenantId: runtime.tenantId,
    signals: runtime.repo,
    integrations: runtime.integrations,
    pipeline: {
      repo: runtime.repo,
      caseIndex: runtime.caseIndex,
      investigation: investigationDeps(runtime),
    },
  };
  const arg = process.argv[2];
  const results = arg && IDS.has(arg as ConnectorId)
    ? [await pollConnector(arg as ConnectorId, deps, null)]
    : await pollAllConnectors(deps, null);
  for (const { run, configured } of results) {
    console.log(
      `${run.connectorId}: ${run.status}` +
        `${configured ? "" : " (not configured)"}` +
        `; signals=${run.signalsIngested}` +
        `${run.httpStatusClass ? `; http=${run.httpStatusClass}` : ""}` +
        `${run.errorClass ? `; error=${run.errorClass}` : ""}` +
        `; id=${run.id}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Poll failed.");
  process.exit(1);
});
