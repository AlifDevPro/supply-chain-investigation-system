import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type {
  ConnectorId,
  ConnectorRunRow,
  IntegrationRepository,
  ToolCallRow,
} from "./integration-types";
import type { MemoryDb } from "./memory";

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryIntegrationRepository implements IntegrationRepository {
  constructor(readonly db: MemoryDb) {}

  private requireTenant(tenantId: string) {
    if (!this.db.tenants.has(tenantId)) throw new ForeignKeyViolationError(tenantId);
  }

  async insertToolCall(row: ToolCallRow): Promise<void> {
    this.requireTenant(row.tenantId);
    if (this.db.toolCalls.some((t) => t.tenantId === row.tenantId && t.id === row.id)) {
      throw new UniqueViolationError("tool_calls");
    }
    this.db.toolCalls.push(clone(row));
  }

  async listToolCalls(tenantId: string, options: { limit: number }): Promise<ToolCallRow[]> {
    return this.db.toolCalls
      .filter((t) => t.tenantId === tenantId)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, Math.max(1, Math.min(options.limit, 100)))
      .map(clone);
  }

  async insertConnectorRun(row: ConnectorRunRow): Promise<void> {
    this.requireTenant(row.tenantId);
    if (row.actorUserId && !this.db.users.some((u) => u.tenantId === row.tenantId && u.id === row.actorUserId)) {
      throw new ForeignKeyViolationError("actor");
    }
    if (this.db.connectorRuns.some((r) => r.tenantId === row.tenantId && r.id === row.id)) {
      throw new UniqueViolationError("connector_runs");
    }
    this.db.connectorRuns.push(clone(row));
  }

  async listConnectorRuns(
    tenantId: string,
    options: { limit: number; connectorId?: ConnectorId },
  ): Promise<ConnectorRunRow[]> {
    return this.db.connectorRuns
      .filter((r) => r.tenantId === tenantId && (!options.connectorId || r.connectorId === options.connectorId))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, Math.max(1, Math.min(options.limit, 100)))
      .map(clone);
  }

  async latestConnectorRun(tenantId: string, connectorId: ConnectorId): Promise<ConnectorRunRow | null> {
    const rows = await this.listConnectorRuns(tenantId, { limit: 1, connectorId });
    return rows[0] ?? null;
  }
}
