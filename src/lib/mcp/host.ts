import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { BusinessRecordReader } from "@/lib/investigation/reader";
import type { IntegrationRepository, ToolActorKind } from "@/lib/store/integration-types";
import type { EventDraft, SignalRepository } from "@/lib/store/types";
import { isMcpToolName, MCP_TOOL_NAMES, runMcpTool, TOOL_DESCRIPTIONS, type McpToolName } from "./tools";

export class McpAuthError extends Error {
  constructor(message = "A valid MCP bearer key is required.") {
    super(message);
    this.name = "McpAuthError";
  }
}

export class McpToolError extends Error {
  constructor(
    readonly code: "validation_error" | "timeout" | "internal_error" | "authorization_denied",
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

export interface McpHostDeps {
  tenantId: string;
  reader: BusinessRecordReader;
  integrations: IntegrationRepository;
  signals: SignalRepository;
  timeoutMs: number;
}

export interface ToolCallActor {
  kind: ToolActorKind;
  id: string;
}

function draft(
  type: EventDraft["type"],
  status: EventDraft["status"],
  correlationId: string,
  occurredAt: string,
  durationMs: number | null,
  metadata: Record<string, string | number | boolean>,
  errorClass: EventDraft["errorClass"] = null,
): EventDraft {
  return {
    signalId: null,
    caseId: null,
    correlationId,
    type,
    stage: "integration",
    status,
    occurredAt,
    durationMs,
    method: { kind: "system", name: "mcp.tools.v1" },
    retryCount: 0,
    errorClass,
    metadata,
    dataMode: "synthetic",
  };
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new McpToolError("timeout", "Tool timed out.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function listToolDefs() {
  return MCP_TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
  }));
}

/**
 * Runs one MCP tool with audit + Live Activity events. Tenant is always deps.tenantId.
 */
export async function invokeTool(
  deps: McpHostDeps,
  toolName: string,
  rawArgs: unknown,
  actor: ToolCallActor,
): Promise<{ tool: McpToolName; result: unknown; truncated: boolean; rowCount: number; callId: string }> {
  if (!isMcpToolName(toolName)) throw new McpToolError("validation_error", `Unknown tool: ${toolName}`);
  const callId = `TOOL-${randomUUID().slice(0, 12)}`;
  const correlationId = `corr-${callId}`;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  await deps.signals.transaction((tx) =>
    tx.insertEvents(deps.tenantId, [
      draft("tool.called", "completed", correlationId, startedAt, null, {
        tool: toolName,
        actorKind: actor.kind,
        callId,
      }),
    ]),
  );
  try {
    const outcome = await withTimeout(runMcpTool(toolName, rawArgs, deps.reader, deps.tenantId), deps.timeoutMs);
    const durationMs = Date.now() - started;
    const finishedAt = new Date().toISOString();
    await deps.integrations.insertToolCall({
      tenantId: deps.tenantId,
      id: callId,
      toolName,
      status: "completed",
      durationMs,
      actorKind: actor.kind,
      actorId: actor.id,
      errorClass: null,
      metadata: { truncated: outcome.truncated, rows: outcome.rowCount },
      at: finishedAt,
      dataMode: "synthetic",
    });
    await deps.signals.transaction((tx) =>
      tx.insertEvents(deps.tenantId, [
        draft("tool.completed", "completed", correlationId, finishedAt, durationMs, {
          tool: toolName,
          callId,
          rows: outcome.rowCount,
          truncated: outcome.truncated,
        }),
      ]),
    );
    return { tool: toolName, result: outcome.content, truncated: outcome.truncated, rowCount: outcome.rowCount, callId };
  } catch (error) {
    const durationMs = Date.now() - started;
    const finishedAt = new Date().toISOString();
    const code =
      error instanceof McpToolError
        ? error.code
        : error instanceof ZodError
          ? "validation_error"
          : "internal_error";
    await deps.integrations.insertToolCall({
      tenantId: deps.tenantId,
      id: callId,
      toolName,
      status: "failed",
      durationMs,
      actorKind: actor.kind,
      actorId: actor.id,
      errorClass: code,
      metadata: { reason: code },
      at: finishedAt,
      dataMode: "synthetic",
    });
    await deps.signals.transaction((tx) =>
      tx.insertEvents(deps.tenantId, [
        draft("tool.failed", "failed", correlationId, finishedAt, durationMs, { tool: toolName, callId, reason: code }, code),
      ]),
    );
    if (error instanceof McpToolError || error instanceof ZodError) {
      throw error instanceof ZodError ? new McpToolError("validation_error", "Invalid tool arguments.") : error;
    }
    throw new McpToolError("internal_error", "The tool failed.");
  }
}
