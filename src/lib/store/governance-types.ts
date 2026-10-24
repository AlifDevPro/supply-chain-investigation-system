import type { ProposedAction } from "@/lib/domain";
import type { Role } from "@/lib/auth/roles";

export type ReviewDecisionKind = "acknowledge" | "request_evidence" | "dismiss" | "reject";

export interface StoredUser {
  tenantId: string;
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /** Null when the account signs in with Google only. */
  passwordHash: string | null;
  /** Google `sub`, set when that identity has been linked. */
  googleSub: string | null;
  disabledAt: string | null;
  createdAt: string;
  dataMode: "synthetic";
}

export interface ReviewDecision {
  tenantId: string;
  id: string;
  caseId: string | null;
  signalId: string | null;
  decision: ReviewDecisionKind;
  rationale: string;
  actorUserId: string;
  at: string;
  dataMode: "synthetic";
}

export interface StoredProposedAction {
  tenantId: string;
  id: string;
  caseId: string;
  title: string;
  parameters: Array<{ label: string; value: string }>;
  parameterDigest: string;
  rationale: string;
  origin: "rule_suggested";
  status: ProposedAction["status"];
  version: number;
  requiredRole: Role;
  updatedAt: string;
  dataMode: "synthetic";
}

export interface ActionApproval {
  tenantId: string;
  id: string;
  actionId: string;
  approvedVersion: number;
  parameterDigest: string;
  actorUserId: string;
  at: string;
  dataMode: "synthetic";
}

export interface ActionExecution {
  tenantId: string;
  id: string;
  actionId: string;
  actionVersion: number;
  adapter: "synthetic.v1";
  status: "started" | "completed" | "failed";
  sent: boolean;
  reason: string;
  idempotencyKey: string;
  actorUserId: string;
  at: string;
  dataMode: "synthetic";
}

export interface OutcomeObservation {
  tenantId: string;
  id: string;
  caseId: string;
  actionId: string | null;
  summary: string;
  matched: boolean;
  actorUserId: string;
  at: string;
  dataMode: "synthetic";
}

export interface GovernanceRepository {
  getUserByEmail(tenantId: string, email: string): Promise<StoredUser | null>;
  getUserById(tenantId: string, id: string): Promise<StoredUser | null>;
  getUserByGoogleSub(tenantId: string, googleSub: string): Promise<StoredUser | null>;
  upsertUser(user: StoredUser): Promise<void>;
  /** Attaches a Google subject without changing role or password. */
  linkGoogleSub(tenantId: string, userId: string, googleSub: string): Promise<void>;
  insertDecision(row: ReviewDecision): Promise<void>;
  listDecisionsForCase(tenantId: string, caseId: string): Promise<ReviewDecision[]>;
  listDecisionsForSignal(tenantId: string, signalId: string): Promise<ReviewDecision[]>;
  /** Signals whose review decision takes them off the held queue. `request_evidence` does not. */
  closedSignalIds(tenantId: string): Promise<string[]>;
  listActionsForCase(tenantId: string, caseId: string): Promise<StoredProposedAction[]>;
  getAction(tenantId: string, actionId: string): Promise<StoredProposedAction | null>;
  upsertAction(row: StoredProposedAction): Promise<void>;
  insertApproval(row: ActionApproval): Promise<void>;
  listApprovals(tenantId: string, actionId: string): Promise<ActionApproval[]>;
  insertExecution(row: ActionExecution): Promise<void>;
  getExecutionByKey(tenantId: string, key: string): Promise<ActionExecution | null>;
  listExecutions(tenantId: string, actionId: string): Promise<ActionExecution[]>;
  insertObservation(row: OutcomeObservation): Promise<void>;
  listObservations(tenantId: string, caseId: string): Promise<OutcomeObservation[]>;
}

export function toProposedAction(row: StoredProposedAction): ProposedAction {
  return {
    id: row.id,
    caseId: row.caseId,
    title: row.title,
    parameters: row.parameters,
    rationale: row.rationale,
    origin: row.origin,
    status: row.status,
    version: row.version,
    requiredRole: row.requiredRole,
    dataMode: row.dataMode,
  };
}
