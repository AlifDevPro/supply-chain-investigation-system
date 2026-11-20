import type { SqlClient, SqlRow } from "@/lib/db/sql";
import type { ErrorClass } from "@/lib/domain/events";
import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type {
  ConnectorId,
  ConnectorRunRow,
  HttpStatusClass,
  IntegrationRepository,
  ToolActorKind,
  ToolCallRow,
  ToolCallStatus,
  ConnectorRunStatus,
} from "./integration-types";

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const json = (value: unknown): string => JSON.stringify(value);

function sqlState(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

async function mapErrors<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const state = sqlState(error);
    if (state === "23505") throw new UniqueViolationError(label);
    if (state === "23503") throw new ForeignKeyViolationError(label);
    throw error;
  }
}

function meta(row: SqlRow): Record<string, string | number | boolean> {
  const raw = row.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, string | number | boolean>;
  if (typeof raw === "string") return JSON.parse(raw) as Record<string, string | number | boolean>;
  return {};
}

function rowToTool(row: SqlRow): ToolCallRow {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    toolName: String(row.tool_name),
    status: String(row.status) as ToolCallStatus,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    actorKind: String(row.actor_kind) as ToolActorKind,
    actorId: String(row.actor_id),
    errorClass: row.error_class == null ? null : (String(row.error_class) as ErrorClass),
    metadata: meta(row),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

function rowToRun(row: SqlRow): ConnectorRunRow {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    connectorId: String(row.connector_id) as ConnectorId,
    status: String(row.status) as ConnectorRunStatus,
    httpStatusClass: row.http_status_class == null ? null : (String(row.http_status_class) as HttpStatusClass),
    signalsIngested: Number(row.signals_ingested),
    errorClass: row.error_class == null ? null : (String(row.error_class) as ErrorClass),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    metadata: meta(row),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

export class PostgresIntegrationRepository implements IntegrationRepository {
  constructor(private readonly client: SqlClient) {}

  async insertToolCall(row: ToolCallRow): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into tool_calls (
             tenant_id, id, tool_name, status, duration_ms, actor_kind, actor_id, error_class, metadata, at, data_mode
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::text::jsonb,$10,'synthetic')`,
          [
            row.tenantId, row.id, row.toolName, row.status, row.durationMs, row.actorKind, row.actorId,
            row.errorClass, json(row.metadata), row.at,
          ],
        ),
      "tool_calls",
    );
  }

  async listToolCalls(tenantId: string, options: { limit: number }): Promise<ToolCallRow[]> {
    const limit = Math.max(1, Math.min(options.limit, 100));
    const rows = await this.client.query(
      `select tenant_id, id, tool_name, status, duration_ms, actor_kind, actor_id, error_class, metadata, at
         from tool_calls where tenant_id = $1 order by at desc limit $2`,
      [tenantId, limit],
    );
    return rows.map(rowToTool);
  }

  async insertConnectorRun(row: ConnectorRunRow): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into connector_runs (
             tenant_id, id, connector_id, status, http_status_class, signals_ingested, error_class,
             duration_ms, actor_user_id, metadata, at, data_mode
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::jsonb,$11,'synthetic')`,
          [
            row.tenantId, row.id, row.connectorId, row.status, row.httpStatusClass, row.signalsIngested,
            row.errorClass, row.durationMs, row.actorUserId, json(row.metadata), row.at,
          ],
        ),
      "connector_runs",
    );
  }

  async listConnectorRuns(
    tenantId: string,
    options: { limit: number; connectorId?: ConnectorId },
  ): Promise<ConnectorRunRow[]> {
    const limit = Math.max(1, Math.min(options.limit, 100));
    if (options.connectorId) {
      const rows = await this.client.query(
        `select tenant_id, id, connector_id, status, http_status_class, signals_ingested, error_class,
                duration_ms, actor_user_id, metadata, at
           from connector_runs where tenant_id = $1 and connector_id = $2 order by at desc limit $3`,
        [tenantId, options.connectorId, limit],
      );
      return rows.map(rowToRun);
    }
    const rows = await this.client.query(
      `select tenant_id, id, connector_id, status, http_status_class, signals_ingested, error_class,
              duration_ms, actor_user_id, metadata, at
         from connector_runs where tenant_id = $1 order by at desc limit $2`,
      [tenantId, limit],
    );
    return rows.map(rowToRun);
  }

  async latestConnectorRun(tenantId: string, connectorId: ConnectorId): Promise<ConnectorRunRow | null> {
    const rows = await this.listConnectorRuns(tenantId, { limit: 1, connectorId });
    return rows[0] ?? null;
  }
}
