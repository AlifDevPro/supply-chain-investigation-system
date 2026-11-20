import type { ErrorClass } from "@/lib/domain/events";

export type ToolCallStatus = "completed" | "failed" | "unauthorized";
export type ToolActorKind = "mcp_key" | "session" | "stdio";
export type ConnectorId = "mailbox" | "erp_po" | "carrier";
export type ConnectorRunStatus = "completed" | "failed" | "skipped";
export type HttpStatusClass = "2xx" | "4xx" | "5xx" | "network";

export interface ToolCallRow {
  tenantId: string;
  id: string;
  toolName: string;
  status: ToolCallStatus;
  durationMs: number | null;
  actorKind: ToolActorKind;
  actorId: string;
  errorClass: ErrorClass | null;
  metadata: Record<string, string | number | boolean>;
  at: string;
  dataMode: "synthetic";
}

export interface ConnectorRunRow {
  tenantId: string;
  id: string;
  connectorId: ConnectorId;
  status: ConnectorRunStatus;
  httpStatusClass: HttpStatusClass | null;
  signalsIngested: number;
  errorClass: ErrorClass | null;
  durationMs: number | null;
  actorUserId: string | null;
  metadata: Record<string, string | number | boolean>;
  at: string;
  dataMode: "synthetic";
}

export interface IntegrationRepository {
  insertToolCall(row: ToolCallRow): Promise<void>;
  listToolCalls(tenantId: string, options: { limit: number }): Promise<ToolCallRow[]>;
  insertConnectorRun(row: ConnectorRunRow): Promise<void>;
  listConnectorRuns(tenantId: string, options: { limit: number; connectorId?: ConnectorId }): Promise<ConnectorRunRow[]>;
  latestConnectorRun(tenantId: string, connectorId: ConnectorId): Promise<ConnectorRunRow | null>;
}
