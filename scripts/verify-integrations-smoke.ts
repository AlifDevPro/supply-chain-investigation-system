import { createPostgresClient } from "@/lib/db/postgres-client";
import { parseEnv } from "@/lib/env";

async function main() {
  const env = parseEnv(process.env);
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const client = createPostgresClient(env.DATABASE_URL, { max: 1 });
  try {
    const runs = await client.query(
      `select connector_id, status, signals_ingested, http_status_class
         from connector_runs where tenant_id = $1 order by at desc limit 5`,
      [env.DEMO_TENANT_ID],
    );
    const events = await client.query(
      `select type, status from signal_events where tenant_id = $1 and stage = $2
        order by occurred_at desc limit 8`,
      [env.DEMO_TENANT_ID, "integration"],
    );
    console.log(
      "connector_runs",
      runs.map((r) => `${r.connector_id}:${r.status}:sig=${r.signals_ingested}:${r.http_status_class ?? "-"}`).join(", ") || "none",
    );
    console.log("integration_events", events.map((e) => `${e.type}:${e.status}`).join(", ") || "none");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
