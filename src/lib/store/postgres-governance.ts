import type { SqlClient, SqlRow } from "@/lib/db/sql";
import { isRole, type Role } from "@/lib/auth/roles";
import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type {
  ActionApproval,
  ActionExecution,
  GovernanceRepository,
  OutcomeObservation,
  ReviewDecision,
  ReviewDecisionKind,
  StoredProposedAction,
  StoredUser,
} from "./governance-types";
import type { ProposedAction } from "@/lib/domain";

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
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

function roleOf(value: unknown): Role {
  const role = String(value);
  if (!isRole(role)) throw new Error("unexpected role");
  return role;
}

function rowToUser(row: SqlRow): StoredUser {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: roleOf(row.role),
    passwordHash: row.password_hash == null ? null : String(row.password_hash),
    googleSub: row.google_sub == null ? null : String(row.google_sub),
    disabledAt: row.disabled_at ? iso(row.disabled_at) : null,
    createdAt: iso(row.created_at),
    dataMode: "synthetic",
  };
}

function rowToDecision(row: SqlRow): ReviewDecision {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    caseId: str(row.case_id),
    signalId: str(row.signal_id),
    decision: String(row.decision) as ReviewDecisionKind,
    rationale: String(row.rationale),
    actorUserId: String(row.actor_user_id),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

function rowToAction(row: SqlRow): StoredProposedAction {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    caseId: String(row.case_id),
    title: String(row.title),
    parameters: (Array.isArray(row.parameters) ? row.parameters : JSON.parse(String(row.parameters))) as StoredProposedAction["parameters"],
    parameterDigest: String(row.parameter_digest),
    rationale: String(row.rationale),
    origin: "rule_suggested",
    status: String(row.status) as ProposedAction["status"],
    version: Number(row.version),
    requiredRole: roleOf(row.required_role),
    updatedAt: iso(row.updated_at),
    dataMode: "synthetic",
  };
}

function rowToApproval(row: SqlRow): ActionApproval {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    actionId: String(row.action_id),
    approvedVersion: Number(row.approved_version),
    parameterDigest: String(row.parameter_digest),
    actorUserId: String(row.actor_user_id),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

function rowToExecution(row: SqlRow): ActionExecution {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    actionId: String(row.action_id),
    actionVersion: Number(row.action_version),
    adapter: "synthetic.v1",
    status: String(row.status) as ActionExecution["status"],
    sent: row.sent === true,
    reason: String(row.reason),
    idempotencyKey: String(row.idempotency_key),
    actorUserId: String(row.actor_user_id),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

function rowToObservation(row: SqlRow): OutcomeObservation {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    caseId: String(row.case_id),
    actionId: str(row.action_id),
    summary: String(row.summary),
    matched: row.matched === true,
    actorUserId: String(row.actor_user_id),
    at: iso(row.at),
    dataMode: "synthetic",
  };
}

export class PostgresGovernanceRepository implements GovernanceRepository {
  constructor(private readonly client: SqlClient) {}

  async getUserByEmail(tenantId: string, email: string): Promise<StoredUser | null> {
    const rows = await this.client.query(
      "select tenant_id, id, email, display_name, role, password_hash, google_sub, disabled_at, created_at from users where tenant_id = $1 and email = $2",
      [tenantId, email],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async getUserById(tenantId: string, id: string): Promise<StoredUser | null> {
    const rows = await this.client.query(
      "select tenant_id, id, email, display_name, role, password_hash, google_sub, disabled_at, created_at from users where tenant_id = $1 and id = $2",
      [tenantId, id],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async getUserByGoogleSub(tenantId: string, googleSub: string): Promise<StoredUser | null> {
    const rows = await this.client.query(
      "select tenant_id, id, email, display_name, role, password_hash, google_sub, disabled_at, created_at from users where tenant_id = $1 and google_sub = $2",
      [tenantId, googleSub],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async upsertUser(user: StoredUser): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into users (tenant_id, id, email, display_name, role, password_hash, google_sub, disabled_at, created_at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'synthetic')
           on conflict (tenant_id, id) do update set
             email = excluded.email, display_name = excluded.display_name, role = excluded.role,
             password_hash = excluded.password_hash, google_sub = excluded.google_sub, disabled_at = excluded.disabled_at`,
          [user.tenantId, user.id, user.email, user.displayName, user.role, user.passwordHash, user.googleSub, user.disabledAt, user.createdAt],
        ),
      "users",
    );
  }

  async linkGoogleSub(tenantId: string, userId: string, googleSub: string): Promise<void> {
    await mapErrors(async () => {
      const rows = await this.client.query(
        "update users set google_sub = $3 where tenant_id = $1 and id = $2 returning id",
        [tenantId, userId, googleSub],
      );
      if (rows.length === 0) throw new ForeignKeyViolationError("users");
    }, "users_google_sub");
  }

  async insertDecision(row: ReviewDecision): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into review_decisions (tenant_id, id, case_id, signal_id, decision, rationale, actor_user_id, at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'synthetic')`,
          [row.tenantId, row.id, row.caseId, row.signalId, row.decision, row.rationale, row.actorUserId, row.at],
        ),
      "review_decisions",
    );
  }

  async listDecisionsForCase(tenantId: string, caseId: string): Promise<ReviewDecision[]> {
    const rows = await this.client.query(
      "select tenant_id, id, case_id, signal_id, decision, rationale, actor_user_id, at from review_decisions where tenant_id = $1 and case_id = $2 order by at desc",
      [tenantId, caseId],
    );
    return rows.map(rowToDecision);
  }

  async listDecisionsForSignal(tenantId: string, signalId: string): Promise<ReviewDecision[]> {
    const rows = await this.client.query(
      "select tenant_id, id, case_id, signal_id, decision, rationale, actor_user_id, at from review_decisions where tenant_id = $1 and signal_id = $2 order by at desc",
      [tenantId, signalId],
    );
    return rows.map(rowToDecision);
  }

  async closedSignalIds(tenantId: string): Promise<string[]> {
    const rows = await this.client.query(
      `select distinct signal_id from review_decisions
        where tenant_id = $1 and signal_id is not null and decision <> 'request_evidence'`,
      [tenantId],
    );
    return rows.map((r) => String(r.signal_id));
  }

  async listActionsForCase(tenantId: string, caseId: string): Promise<StoredProposedAction[]> {
    const rows = await this.client.query(
      `select tenant_id, id, case_id, title, parameters, parameter_digest, rationale, origin, status, version, required_role, updated_at
         from proposed_actions where tenant_id = $1 and case_id = $2 order by id`,
      [tenantId, caseId],
    );
    return rows.map(rowToAction);
  }

  async getAction(tenantId: string, actionId: string): Promise<StoredProposedAction | null> {
    const rows = await this.client.query(
      `select tenant_id, id, case_id, title, parameters, parameter_digest, rationale, origin, status, version, required_role, updated_at
         from proposed_actions where tenant_id = $1 and id = $2`,
      [tenantId, actionId],
    );
    return rows[0] ? rowToAction(rows[0]) : null;
  }

  async upsertAction(row: StoredProposedAction): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into proposed_actions (tenant_id, id, case_id, title, parameters, parameter_digest, rationale, origin, status, version, required_role, updated_at, data_mode)
           values ($1, $2, $3, $4, $5::text::jsonb, $6, $7, $8, $9, $10, $11, $12, 'synthetic')
           on conflict (tenant_id, id) do update set
             title = excluded.title, parameters = excluded.parameters, parameter_digest = excluded.parameter_digest,
             rationale = excluded.rationale, status = excluded.status, version = excluded.version,
             required_role = excluded.required_role, updated_at = excluded.updated_at`,
          [
            row.tenantId, row.id, row.caseId, row.title, json(row.parameters), row.parameterDigest, row.rationale,
            row.origin, row.status, row.version, row.requiredRole, row.updatedAt,
          ],
        ),
      "proposed_actions",
    );
  }

  async insertApproval(row: ActionApproval): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into action_approvals (tenant_id, id, action_id, approved_version, parameter_digest, actor_user_id, at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, 'synthetic')`,
          [row.tenantId, row.id, row.actionId, row.approvedVersion, row.parameterDigest, row.actorUserId, row.at],
        ),
      "action_approvals",
    );
  }

  async listApprovals(tenantId: string, actionId: string): Promise<ActionApproval[]> {
    const rows = await this.client.query(
      "select tenant_id, id, action_id, approved_version, parameter_digest, actor_user_id, at from action_approvals where tenant_id = $1 and action_id = $2 order by at desc",
      [tenantId, actionId],
    );
    return rows.map(rowToApproval);
  }

  async insertExecution(row: ActionExecution): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into action_executions (tenant_id, id, action_id, action_version, adapter, status, sent, reason, idempotency_key, actor_user_id, at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'synthetic')`,
          [
            row.tenantId, row.id, row.actionId, row.actionVersion, row.adapter, row.status, row.sent, row.reason,
            row.idempotencyKey, row.actorUserId, row.at,
          ],
        ),
      "action_executions",
    );
  }

  async getExecutionByKey(tenantId: string, key: string): Promise<ActionExecution | null> {
    const rows = await this.client.query(
      `select tenant_id, id, action_id, action_version, adapter, status, sent, reason, idempotency_key, actor_user_id, at
         from action_executions where tenant_id = $1 and idempotency_key = $2`,
      [tenantId, key],
    );
    return rows[0] ? rowToExecution(rows[0]) : null;
  }

  async listExecutions(tenantId: string, actionId: string): Promise<ActionExecution[]> {
    const rows = await this.client.query(
      `select tenant_id, id, action_id, action_version, adapter, status, sent, reason, idempotency_key, actor_user_id, at
         from action_executions where tenant_id = $1 and action_id = $2 order by at desc`,
      [tenantId, actionId],
    );
    return rows.map(rowToExecution);
  }

  async insertObservation(row: OutcomeObservation): Promise<void> {
    await mapErrors(
      () =>
        this.client.query(
          `insert into outcome_observations (tenant_id, id, case_id, action_id, summary, matched, actor_user_id, at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'synthetic')`,
          [row.tenantId, row.id, row.caseId, row.actionId, row.summary, row.matched, row.actorUserId, row.at],
        ),
      "outcome_observations",
    );
  }

  async listObservations(tenantId: string, caseId: string): Promise<OutcomeObservation[]> {
    const rows = await this.client.query(
      "select tenant_id, id, case_id, action_id, summary, matched, actor_user_id, at from outcome_observations where tenant_id = $1 and case_id = $2 order by at desc",
      [tenantId, caseId],
    );
    return rows.map(rowToObservation);
  }
}
