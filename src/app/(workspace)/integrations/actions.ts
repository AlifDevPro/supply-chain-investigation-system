"use server";

import { revalidatePath } from "next/cache";
import { canReview } from "@/lib/auth/roles";
import { requireSession, SessionError } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { pollConnector } from "@/lib/integrations/adapters";
import { connectorConfigs, isConfigured } from "@/lib/integrations/config";
import { invokeTool, listToolDefs, McpToolError } from "@/lib/mcp/host";
import { logEvent } from "@/lib/log";
import { getConnectorLimiter, getRuntime, investigationDeps, mcpHostDeps } from "@/lib/runtime";
import type { ConnectorId, ConnectorRunRow, ToolCallRow } from "@/lib/store/integration-types";
import type { InvestigationEvent } from "@/lib/domain/events";

export type IntegrationActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const CONNECTOR_IDS = new Set<ConnectorId>(["mailbox", "erp_po", "carrier"]);

export async function runConnectorNow(_prev: IntegrationActionState, formData: FormData): Promise<IntegrationActionState> {
  try {
    const actor = await requireSession();
    if (!canReview(actor.role)) return { status: "error", message: "Reviewer role or higher is required." };
    const id = formData.get("connectorId");
    if (typeof id !== "string" || !CONNECTOR_IDS.has(id as ConnectorId)) {
      return { status: "error", message: "Unknown connector." };
    }
    if (!getConnectorLimiter().check(`connector-${actor.userId}`).allowed) {
      return { status: "error", message: "Too many connector polls. Wait a minute and try again." };
    }
    const runtime = await getRuntime();
    if (!runtime) return { status: "error", message: "No store is configured." };
    if (actor.tenantId !== runtime.tenantId) return { status: "error", message: "Not found for this tenant." };
    const env = getEnv();
    const config = connectorConfigs(env).find((c) => c.id === id)!;
    if (!isConfigured(config)) {
      return { status: "error", message: "This connector is not configured." };
    }
    const { run } = await pollConnector(id as ConnectorId, {
      env,
      tenantId: runtime.tenantId,
      signals: runtime.repo,
      integrations: runtime.integrations,
      pipeline: { repo: runtime.repo, caseIndex: runtime.caseIndex, investigation: investigationDeps(runtime) },
    }, actor.userId);
    logEvent("info", "connector.poll", { connector: id, status: run.status, runId: run.id, userId: actor.userId });
    revalidatePath("/integrations");
    revalidatePath("/live-activity");
    revalidatePath("/");
    return {
      status: "done",
      message:
        run.status === "completed"
          ? `Poll completed; ${run.signalsIngested} signal(s) ingested.`
          : `Poll ${run.status}${run.errorClass ? ` (${run.errorClass})` : ""}.`,
    };
  } catch (error) {
    if (error instanceof SessionError) return { status: "error", message: "Sign in required." };
    logEvent("error", "connector.poll.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The connector poll failed." };
  }
}

export async function mcpSmokeCall(_prev: IntegrationActionState, _formData?: FormData): Promise<IntegrationActionState> {
  try {
    const actor = await requireSession();
    if (!canReview(actor.role)) return { status: "error", message: "Reviewer role or higher is required." };
    if (!getConnectorLimiter().check(`mcp-smoke-${actor.userId}`).allowed) {
      return { status: "error", message: "Too many MCP smoke calls. Wait a minute and try again." };
    }
    const runtime = await getRuntime();
    if (!runtime) return { status: "error", message: "No store is configured." };
    if (actor.tenantId !== runtime.tenantId) return { status: "error", message: "Not found for this tenant." };
    const out = await invokeTool(mcpHostDeps(runtime), "get_purchase_order", { purchaseOrderId: "PO-77410" }, {
      kind: "session",
      id: actor.userId,
    });
    logEvent("info", "mcp.smoke", { callId: out.callId, userId: actor.userId, rows: out.rowCount });
    revalidatePath("/integrations");
    revalidatePath("/live-activity");
    return {
      status: "done",
      message: `Smoke call completed (${out.callId}); ${out.rowCount} row(s)${out.truncated ? ", truncated" : ""}.`,
    };
  } catch (error) {
    if (error instanceof SessionError) return { status: "error", message: "Sign in required." };
    if (error instanceof McpToolError) return { status: "error", message: error.message };
    logEvent("error", "mcp.smoke.failed", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return { status: "error", message: "The MCP smoke call failed." };
  }
}

export type IntegrationActivitySnapshot = {
  asOf: string;
  mcpConfigured: boolean;
  tools: Array<{ name: string; description: string }>;
  toolCalls: ToolCallRow[];
  connectorRuns: ConnectorRunRow[];
  events: InvestigationEvent[];
  storeMode: string | null;
};

/** Lightweight snapshot for the Integrations 5s poll. Tenant always from the runtime. */
export async function fetchIntegrationActivity(): Promise<IntegrationActivitySnapshot | { error: string }> {
  try {
    const actor = await requireSession();
    const runtime = await getRuntime();
    if (!runtime) {
      return {
        asOf: new Date().toISOString(),
        mcpConfigured: Boolean(getEnv().MCP_API_KEY),
        tools: listToolDefs(),
        toolCalls: [],
        connectorRuns: [],
        events: [],
        storeMode: null,
      };
    }
    if (actor.tenantId !== runtime.tenantId) return { error: "Not found for this tenant." };
    const [toolCalls, connectorRuns, events] = await Promise.all([
      runtime.integrations.listToolCalls(runtime.tenantId, { limit: 20 }),
      runtime.integrations.listConnectorRuns(runtime.tenantId, { limit: 20 }),
      runtime.repo.listEvents(runtime.tenantId, { limit: 50 }),
    ]);
    return {
      asOf: new Date().toISOString(),
      mcpConfigured: Boolean(getEnv().MCP_API_KEY),
      tools: listToolDefs(),
      toolCalls,
      connectorRuns,
      events: events.filter((e) => e.stage === "integration"),
      storeMode: runtime.mode,
    };
  } catch (error) {
    if (error instanceof SessionError) return { error: "Sign in required." };
    return { error: "Activity is unavailable." };
  }
}
