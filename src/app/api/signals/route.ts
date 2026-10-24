import { getEnv } from "@/lib/env";
import { handleIngest } from "@/lib/ingestion/http";
import { getLimiters, getRuntime, investigationDeps } from "@/lib/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/signals - see docs/signal-ingestion.md. Authentication, limits and errors live in handleIngest. */
export async function POST(request: Request): Promise<Response> {
  let env;
  try {
    env = getEnv();
  } catch {
    return Response.json(
      { error: { code: "ingestion_disabled", message: "Signal ingestion is not enabled on this server." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return handleIngest(request, {
    apiKey: env.INGEST_API_KEY,
    tenantId: env.DEMO_TENANT_ID,
    getStore: async () => {
      const runtime = await getRuntime();
      return runtime && { repo: runtime.repo, caseIndex: runtime.caseIndex, investigation: investigationDeps(runtime) };
    },
    ...getLimiters(),
  });
}
