import { ForeignKeyViolationError, UniqueViolationError } from "./types";
import type {
  ActionApproval,
  ActionExecution,
  GovernanceRepository,
  OutcomeObservation,
  ReviewDecision,
  StoredProposedAction,
  StoredUser,
} from "./governance-types";
import type { MemoryDb } from "./memory";

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryGovernanceRepository implements GovernanceRepository {
  constructor(readonly db: MemoryDb) {}

  private requireTenant(tenantId: string) {
    if (!this.db.tenants.has(tenantId)) throw new ForeignKeyViolationError(tenantId);
  }

  async getUserByEmail(tenantId: string, email: string): Promise<StoredUser | null> {
    return clone(this.db.users.find((u) => u.tenantId === tenantId && u.email === email) ?? null);
  }

  async getUserById(tenantId: string, id: string): Promise<StoredUser | null> {
    return clone(this.db.users.find((u) => u.tenantId === tenantId && u.id === id) ?? null);
  }

  async getUserByGoogleSub(tenantId: string, googleSub: string): Promise<StoredUser | null> {
    return clone(this.db.users.find((u) => u.tenantId === tenantId && u.googleSub === googleSub) ?? null);
  }

  async upsertUser(user: StoredUser): Promise<void> {
    this.requireTenant(user.tenantId);
    if (!user.passwordHash && !user.googleSub) throw new Error("A user needs a password or a Google subject.");
    const i = this.db.users.findIndex((u) => u.tenantId === user.tenantId && u.id === user.id);
    const emailClash = this.db.users.find((u) => u.tenantId === user.tenantId && u.email === user.email && u.id !== user.id);
    if (emailClash) throw new UniqueViolationError("users_email");
    const subClash = user.googleSub
      ? this.db.users.find((u) => u.tenantId === user.tenantId && u.googleSub === user.googleSub && u.id !== user.id)
      : undefined;
    if (subClash) throw new UniqueViolationError("users_google_sub");
    if (i >= 0) this.db.users[i] = clone(user);
    else this.db.users.push(clone(user));
  }

  async linkGoogleSub(tenantId: string, userId: string, googleSub: string): Promise<void> {
    this.requireTenant(tenantId);
    const user = this.db.users.find((u) => u.tenantId === tenantId && u.id === userId);
    if (!user) throw new ForeignKeyViolationError("users");
    const clash = this.db.users.find((u) => u.tenantId === tenantId && u.googleSub === googleSub && u.id !== userId);
    if (clash) throw new UniqueViolationError("users_google_sub");
    user.googleSub = googleSub;
  }

  async insertDecision(row: ReviewDecision): Promise<void> {
    this.requireTenant(row.tenantId);
    if (this.db.decisions.some((d) => d.tenantId === row.tenantId && d.id === row.id)) throw new UniqueViolationError("review_decisions");
    if (!this.db.users.some((u) => u.tenantId === row.tenantId && u.id === row.actorUserId)) throw new ForeignKeyViolationError("actor");
    this.db.decisions.push(clone(row));
  }

  async listDecisionsForCase(tenantId: string, caseId: string): Promise<ReviewDecision[]> {
    return this.db.decisions.filter((d) => d.tenantId === tenantId && d.caseId === caseId).map(clone);
  }

  async listDecisionsForSignal(tenantId: string, signalId: string): Promise<ReviewDecision[]> {
    return this.db.decisions.filter((d) => d.tenantId === tenantId && d.signalId === signalId).map(clone);
  }

  async closedSignalIds(tenantId: string): Promise<string[]> {
    const ids = new Set<string>();
    for (const d of this.db.decisions) {
      if (d.tenantId === tenantId && d.signalId && d.decision !== "request_evidence") ids.add(d.signalId);
    }
    return [...ids];
  }

  async listActionsForCase(tenantId: string, caseId: string): Promise<StoredProposedAction[]> {
    return this.db.actions.filter((a) => a.tenantId === tenantId && a.caseId === caseId).map(clone);
  }

  async getAction(tenantId: string, actionId: string): Promise<StoredProposedAction | null> {
    return clone(this.db.actions.find((a) => a.tenantId === tenantId && a.id === actionId) ?? null);
  }

  async upsertAction(row: StoredProposedAction): Promise<void> {
    this.requireTenant(row.tenantId);
    if (!this.db.cases.some((c) => c.tenantId === row.tenantId && c.id === row.caseId)) throw new ForeignKeyViolationError("case");
    const i = this.db.actions.findIndex((a) => a.tenantId === row.tenantId && a.id === row.id);
    if (i >= 0) this.db.actions[i] = clone(row);
    else this.db.actions.push(clone(row));
  }

  async insertApproval(row: ActionApproval): Promise<void> {
    this.requireTenant(row.tenantId);
    if (!this.db.actions.some((a) => a.tenantId === row.tenantId && a.id === row.actionId)) throw new ForeignKeyViolationError("action");
    if (this.db.approvals.some((a) => a.tenantId === row.tenantId && a.id === row.id)) throw new UniqueViolationError("action_approvals");
    this.db.approvals.push(clone(row));
  }

  async listApprovals(tenantId: string, actionId: string): Promise<ActionApproval[]> {
    return this.db.approvals.filter((a) => a.tenantId === tenantId && a.actionId === actionId).map(clone);
  }

  async insertExecution(row: ActionExecution): Promise<void> {
    this.requireTenant(row.tenantId);
    if (this.db.executions.some((e) => e.tenantId === row.tenantId && e.idempotencyKey === row.idempotencyKey)) {
      throw new UniqueViolationError("action_executions_key");
    }
    this.db.executions.push(clone(row));
  }

  async getExecutionByKey(tenantId: string, key: string): Promise<ActionExecution | null> {
    return clone(this.db.executions.find((e) => e.tenantId === tenantId && e.idempotencyKey === key) ?? null);
  }

  async listExecutions(tenantId: string, actionId: string): Promise<ActionExecution[]> {
    return this.db.executions.filter((e) => e.tenantId === tenantId && e.actionId === actionId).map(clone);
  }

  async insertObservation(row: OutcomeObservation): Promise<void> {
    this.requireTenant(row.tenantId);
    if (this.db.observations.some((o) => o.tenantId === row.tenantId && o.id === row.id)) throw new UniqueViolationError("outcome_observations");
    this.db.observations.push(clone(row));
  }

  async listObservations(tenantId: string, caseId: string): Promise<OutcomeObservation[]> {
    return this.db.observations.filter((o) => o.tenantId === tenantId && o.caseId === caseId).map(clone);
  }
}
