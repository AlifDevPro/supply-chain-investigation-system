import type {
  CaseState,
  Claim,
  Conflict,
  DeliveryRiskResult,
  EntityEdge,
  EntityNode,
  EvidenceItem,
  ImpactCalculationResult,
  InvestigationEvent,
  RunSummary,
  Severity,
  UnknownItem,
} from "@/lib/domain";
import type { OpenCaseReference } from "@/lib/ingestion/triage";
import type { RetrievalAccounting } from "@/lib/investigation/reader";
import type { ReferenceSet } from "@/lib/investigation/signals";
import type { EventDraft, ListOptions } from "./types";

export type CaseOrigin = "automatic" | "operator";
export type LinkReason = "origin" | "related_reference" | "operator_opened";
export type RunTrigger = RunSummary["trigger"];

/** Current state of a case. History lives in runs and events, which are append-only. */
export interface StoredCase {
  tenantId: string;
  id: string;
  title: string;
  summary: string;
  state: CaseState;
  severity: Severity;
  ownerName: string;
  ownerRole: string;
  nextAction: string;
  requiresReview: boolean;
  reviewReason: string | null;
  origin: CaseOrigin;
  referenceKeys: ReferenceSet;
  latestRunId: string | null;
  openedAt: string;
  updatedAt: string;
  dataMode: "synthetic";
}

export interface CaseLink {
  caseId: string;
  signalId: string;
  linkReason: LinkReason;
  linkedAt: string;
}

export interface RetrievalSummary {
  calls: number;
  rows: number;
  truncated: boolean;
  budgetExhausted: boolean;
}

/** One immutable analysis of a case. */
export interface StoredRun {
  tenantId: string;
  id: string;
  caseId: string;
  runNumber: number;
  trigger: RunTrigger;
  triggerSignalId: string | null;
  ruleVersions: Record<string, string>;
  retrieval: RetrievalSummary;
  entities: { nodes: EntityNode[]; edges: EntityEdge[] };
  startedAt: string;
  finishedAt: string;
  evidence: EvidenceItem[];
  claims: Claim[];
  unknowns: UnknownItem[];
  conflicts: Conflict[];
  shortage: ImpactCalculationResult | null;
  deliveryRisk: DeliveryRiskResult | null;
}

export interface CaseListItem {
  case: StoredCase;
  linkedSignals: number;
  latest: Pick<StoredRun, "id" | "runNumber" | "shortage" | "deliveryRisk"> & {
    claimStates: Claim["state"][];
    unknowns: number;
    conflicts: number;
  } | null;
}

export interface CaseDetailRecord {
  case: StoredCase;
  links: CaseLink[];
  /** Newest first. */
  runs: RunSummary[];
  latest: StoredRun | null;
}

export interface InvestigationTx {
  nextCaseId(): Promise<string>;
  /** Serializes case decisions for the same tenant until the transaction ends. */
  lockCaseDecisions(tenantId: string): Promise<void>;
  getCase(tenantId: string, caseId: string): Promise<StoredCase | null>;
  caseIdForSignal(tenantId: string, signalId: string): Promise<string | null>;
  linkedSignalIds(tenantId: string, caseId: string): Promise<string[]>;
  openCaseReferences(tenantId: string): Promise<OpenCaseReference[]>;
  insertCase(c: StoredCase): Promise<void>;
  /** Replaces the mutable fields of an existing case. */
  updateCase(c: StoredCase): Promise<void>;
  linkSignal(tenantId: string, link: CaseLink): Promise<void>;
  nextRunNumber(tenantId: string, caseId: string): Promise<number>;
  insertRun(run: StoredRun): Promise<void>;
  insertEvents(tenantId: string, events: readonly EventDraft[]): Promise<InvestigationEvent[]>;
}

export interface InvestigationRepository {
  transaction<T>(fn: (tx: InvestigationTx) => Promise<T>): Promise<T>;
  listCases(tenantId: string, options: ListOptions): Promise<CaseListItem[]>;
  getCase(tenantId: string, caseId: string): Promise<CaseDetailRecord | null>;
  openCaseReferences(tenantId: string): Promise<OpenCaseReference[]>;
  /** signalId -> caseId for the given signals of this tenant. */
  caseIdsForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, string>>;
  /** Evidence of each case's latest run, newest observation first. Older runs are history and not listed. */
  listEvidence(tenantId: string, options: ListOptions): Promise<EvidenceItem[]>;
}

/** States in which a case still collects related signals. */
export const OPEN_CASE_STATES: readonly CaseState[] = [
  "received", "triaging", "investigating", "needs_review", "awaiting_approval", "approved", "executing",
  "awaiting_verification", "blocked",
];

export function retrievalSummary(a: RetrievalAccounting): RetrievalSummary {
  return { calls: a.calls.length, rows: a.rows, truncated: a.truncated, budgetExhausted: a.budgetExhausted };
}

export function runSummary(run: StoredRun): RunSummary {
  return {
    id: run.id,
    runNumber: run.runNumber,
    trigger: run.trigger,
    triggerSignalId: run.triggerSignalId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ruleVersions: run.ruleVersions,
    retrieval: run.retrieval,
    counts: { evidence: run.evidence.length, claims: run.claims.length, unknowns: run.unknowns.length, conflicts: run.conflicts.length },
  };
}
