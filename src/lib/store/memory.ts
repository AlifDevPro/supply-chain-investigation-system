import { randomUUID } from "node:crypto";
import type { EvidenceItem } from "@/lib/domain";
import type { InvestigationEvent } from "@/lib/domain/events";
import type { SignalRef } from "@/lib/ingestion/dedupe";
import {
  clampLimit,
  ForeignKeyViolationError,
  toSignalRecord,
  UniqueViolationError,
  type EventDraft,
  type ListOptions,
  type SignalRepository,
  type SignalTx,
  type StoredSignal,
} from "./types";
import type { SignalRecord } from "@/lib/domain/processing";
import type { ReferenceKey } from "@/lib/domain/signal-input";
import {
  OPEN_CASE_STATES,
  runSummary,
  type CaseDetailRecord,
  type CaseLink,
  type CaseListItem,
  type InvestigationRepository,
  type InvestigationTx,
  type StoredCase,
  type StoredRun,
} from "./investigation-types";
import type { OpenCaseReference } from "@/lib/ingestion/triage";
import type { ExtractionOutcome } from "@/lib/ai/extract";
import type { ExtractionKey, ExtractionRepository, StoredExtraction } from "./extraction-types";
import type {
  ActionApproval,
  ActionExecution,
  OutcomeObservation,
  ReviewDecision,
  StoredProposedAction,
  StoredUser,
} from "./governance-types";

const isCanonical = (s: StoredSignal) => s.dedupeStatus === "unique" || s.dedupeStatus === "revision";

function toRef(s: StoredSignal): SignalRef {
  return {
    id: s.id,
    contentHash: s.contentHash ?? "",
    fingerprint: s.fingerprint ?? "",
    receivedAt: s.receivedAt,
    sourceRecordId: s.sourceRecordId,
  };
}

const newestFirst = (a: StoredSignal, b: StoredSignal) =>
  a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : a.id < b.id ? 1 : -1;

/**
 * Shared in-memory state for the signal and investigation repositories. Transactions from both are
 * serialized on one queue and rolled back on error, matching the contract the Postgres repositories meet.
 */
export class MemoryDb {
  tenants = new Set<string>();
  signals: StoredSignal[] = [];
  events: InvestigationEvent[] = [];
  cases: StoredCase[] = [];
  links: (CaseLink & { tenantId: string })[] = [];
  runs: StoredRun[] = [];
  extractions: StoredExtraction[] = [];
  users: StoredUser[] = [];
  decisions: ReviewDecision[] = [];
  actions: StoredProposedAction[] = [];
  approvals: ActionApproval[] = [];
  executions: ActionExecution[] = [];
  observations: OutcomeObservation[] = [];
  signalCounter = 9000;
  caseCounter = 3000;
  eventSequence = 0;
  private queue: Promise<unknown> = Promise.resolve();

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const lengths = [
        this.signals.length, this.events.length, this.links.length, this.runs.length, this.extractions.length,
        this.decisions.length, this.approvals.length, this.executions.length, this.observations.length,
      ] as const;
      // Cases, users and proposed actions are mutable; everything else only appends.
      const cases = structuredClone(this.cases);
      const users = structuredClone(this.users);
      const actions = structuredClone(this.actions);
      try {
        return await fn();
      } catch (error) {
        this.signals.length = lengths[0];
        this.events.length = lengths[1];
        this.links.length = lengths[2];
        this.runs.length = lengths[3];
        this.extractions.length = lengths[4];
        this.decisions.length = lengths[5];
        this.approvals.length = lengths[6];
        this.executions.length = lengths[7];
        this.observations.length = lengths[8];
        this.cases = cases;
        this.users = users;
        this.actions = actions;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  caseIdForSignal(tenantId: string, signalId: string): string | null {
    return this.links.find((l) => l.tenantId === tenantId && l.signalId === signalId)?.caseId ?? null;
  }

  withCaseId(s: StoredSignal): StoredSignal {
    return { ...structuredClone(s), caseId: this.caseIdForSignal(s.tenantId, s.id) };
  }

  insertEvents(tenantId: string, drafts: readonly EventDraft[]): InvestigationEvent[] {
    if (!this.tenants.has(tenantId)) throw new ForeignKeyViolationError(tenantId);
    const stored = drafts.map((draft): InvestigationEvent => {
      if (draft.signalId !== null && !this.signals.some((s) => s.id === draft.signalId && s.tenantId === tenantId)) {
        throw new ForeignKeyViolationError("signal_events_signal_fk");
      }
      if (draft.caseId !== null && !this.cases.some((c) => c.id === draft.caseId && c.tenantId === tenantId)) {
        throw new ForeignKeyViolationError("signal_events_case_fk");
      }
      return { ...structuredClone(draft), id: `evt-${randomUUID()}`, sequence: ++this.eventSequence, tenantId };
    });
    this.events.push(...stored);
    return stored.map((e) => structuredClone(e));
  }

  openCaseReferences(tenantId: string): OpenCaseReference[] {
    return this.cases
      .filter((c) => c.tenantId === tenantId && OPEN_CASE_STATES.includes(c.state))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((c) => ({ caseId: c.id, references: { ...c.referenceKeys } }));
  }
}

/** In-memory signal repository. Used by unit tests and by the explicit `DATA_SOURCE=memory` development mode. */
export class InMemorySignalRepository implements SignalRepository {
  constructor(readonly db: MemoryDb = new MemoryDb()) {}

  async ensureTenant(id: string, name?: string): Promise<void> {
    void name; // The name is only meaningful to a database row.
    this.db.tenants.add(id);
  }

  transaction<T>(fn: (tx: SignalTx) => Promise<T>): Promise<T> {
    return this.db.transaction(() => fn(this.makeTx()));
  }

  private makeTx(): SignalTx {
    const db = this.db;
    const forTenant = (tenantId: string) => db.signals.filter((s) => s.tenantId === tenantId);
    return {
      nextSignalId: async () => `SIG-${++db.signalCounter}`,
      lockDedupeKey: async () => undefined, // The whole transaction queue is already serialized.
      findCanonicalByRecord: async (tenantId, sourceSystem, recordId) =>
        forTenant(tenantId)
          .filter((s) => isCanonical(s) && s.sourceSystem === sourceSystem && s.sourceRecordId === recordId)
          .map(toRef),
      findCanonicalByFingerprint: async (tenantId, fingerprint) =>
        forTenant(tenantId)
          .filter((s) => isCanonical(s) && s.fingerprint === fingerprint)
          .sort(newestFirst)
          .slice(0, 20)
          .map(toRef),
      findCanonicalByReferences: async (tenantId, references, limit) => {
        const entries = Object.entries(references) as Array<[ReferenceKey, string]>;
        if (entries.length === 0) return [];
        return forTenant(tenantId)
          .filter((s) => isCanonical(s) && entries.some(([key, value]) => s.normalized?.references[key] === value))
          .sort(newestFirst)
          .slice(0, limit)
          .map(toRef);
      },
      insertSignal: async (signal) => {
        if (!db.tenants.has(signal.tenantId)) throw new ForeignKeyViolationError(signal.tenantId);
        if (
          signal.sourceRecordId !== null &&
          isCanonical(signal) &&
          db.signals.some(
            (s) =>
              s.tenantId === signal.tenantId &&
              isCanonical(s) &&
              s.sourceSystem === signal.sourceSystem &&
              s.sourceRecordId === signal.sourceRecordId &&
              s.contentHash === signal.contentHash,
          )
        ) {
          throw new UniqueViolationError("signals_canonical_record_content_uq");
        }
        db.signals.push({ ...structuredClone(signal), caseId: null });
      },
      insertEvents: async (tenantId, drafts: readonly EventDraft[]) => db.insertEvents(tenantId, drafts),
    };
  }

  async listSignals(tenantId: string, { limit }: ListOptions): Promise<SignalRecord[]> {
    return this.db.signals
      .filter((s) => s.tenantId === tenantId)
      .sort(newestFirst)
      .slice(0, clampLimit(limit))
      .map((s) => toSignalRecord(this.db.withCaseId(s)));
  }

  async getSignal(tenantId: string, id: string): Promise<StoredSignal | null> {
    const found = this.db.signals.find((s) => s.tenantId === tenantId && s.id === id);
    return found ? this.db.withCaseId(found) : null;
  }

  async listEvents(tenantId: string, options: ListOptions & { correlationId?: string }): Promise<InvestigationEvent[]> {
    return this.db.events
      .filter((e) => e.tenantId === tenantId && (!options.correlationId || e.correlationId === options.correlationId))
      .sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : b.sequence - a.sequence,
      )
      .slice(0, clampLimit(options.limit))
      .map((e) => structuredClone(e));
  }

  async close(): Promise<void> {}
}

/** In-memory investigation repository sharing a `MemoryDb` with the signal repository. */
export class InMemoryInvestigationRepository implements InvestigationRepository {
  constructor(readonly db: MemoryDb) {}

  transaction<T>(fn: (tx: InvestigationTx) => Promise<T>): Promise<T> {
    return this.db.transaction(() => fn(this.makeTx()));
  }

  private makeTx(): InvestigationTx {
    const db = this.db;
    const findCase = (tenantId: string, caseId: string) => db.cases.find((c) => c.tenantId === tenantId && c.id === caseId);
    return {
      nextCaseId: async () => `INV-${++db.caseCounter}`,
      lockCaseDecisions: async () => undefined,
      getCase: async (tenantId, caseId) => structuredClone(findCase(tenantId, caseId) ?? null),
      caseIdForSignal: async (tenantId, signalId) => db.caseIdForSignal(tenantId, signalId),
      linkedSignalIds: async (tenantId, caseId) =>
        db.links.filter((l) => l.tenantId === tenantId && l.caseId === caseId).map((l) => l.signalId),
      openCaseReferences: async (tenantId) => db.openCaseReferences(tenantId),
      insertCase: async (c) => {
        if (!db.tenants.has(c.tenantId)) throw new ForeignKeyViolationError(c.tenantId);
        if (findCase(c.tenantId, c.id)) throw new UniqueViolationError("cases_pkey");
        db.cases.push(structuredClone(c));
      },
      updateCase: async (c) => {
        const i = db.cases.findIndex((x) => x.tenantId === c.tenantId && x.id === c.id);
        if (i < 0) throw new ForeignKeyViolationError(c.id);
        db.cases[i] = { ...structuredClone(c), openedAt: db.cases[i]!.openedAt, origin: db.cases[i]!.origin };
      },
      linkSignal: async (tenantId, link) => {
        if (!findCase(tenantId, link.caseId)) throw new ForeignKeyViolationError("case_signals_case_fk");
        if (!db.signals.some((s) => s.tenantId === tenantId && s.id === link.signalId)) {
          throw new ForeignKeyViolationError("case_signals_signal_fk");
        }
        if (db.links.some((l) => l.tenantId === tenantId && l.signalId === link.signalId)) {
          throw new UniqueViolationError("case_signals_signal_uq");
        }
        db.links.push({ ...link, tenantId });
      },
      nextRunNumber: async (tenantId, caseId) =>
        db.runs.filter((r) => r.tenantId === tenantId && r.caseId === caseId).length + 1,
      insertRun: async (run) => {
        if (!findCase(run.tenantId, run.caseId)) throw new ForeignKeyViolationError("investigation_runs_case_fk");
        if (db.runs.some((r) => r.tenantId === run.tenantId && r.caseId === run.caseId && r.runNumber === run.runNumber)) {
          throw new UniqueViolationError("investigation_runs_number_uq");
        }
        db.runs.push(structuredClone(run));
      },
      insertEvents: async (tenantId, drafts) => db.insertEvents(tenantId, drafts),
    };
  }

  async listCases(tenantId: string, { limit }: ListOptions): Promise<CaseListItem[]> {
    return this.db.cases
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, clampLimit(limit))
      .map((c) => {
        const latest = this.db.runs.find((r) => r.tenantId === tenantId && r.id === c.latestRunId) ?? null;
        return {
          case: structuredClone(c),
          linkedSignals: this.db.links.filter((l) => l.tenantId === tenantId && l.caseId === c.id).length,
          latest: latest && {
            id: latest.id,
            runNumber: latest.runNumber,
            shortage: structuredClone(latest.shortage),
            deliveryRisk: structuredClone(latest.deliveryRisk),
            claimStates: latest.claims.map((x) => x.state),
            unknowns: latest.unknowns.length,
            conflicts: latest.conflicts.length,
          },
        };
      });
  }

  async getCase(tenantId: string, caseId: string): Promise<CaseDetailRecord | null> {
    const c = this.db.cases.find((x) => x.tenantId === tenantId && x.id === caseId);
    if (!c) return null;
    const runs = this.db.runs
      .filter((r) => r.tenantId === tenantId && r.caseId === caseId)
      .sort((a, b) => b.runNumber - a.runNumber);
    return {
      case: structuredClone(c),
      links: this.db.links
        .filter((l) => l.tenantId === tenantId && l.caseId === caseId)
        .map(({ caseId: cid, signalId, linkReason, linkedAt }) => ({ caseId: cid, signalId, linkReason, linkedAt })),
      runs: runs.map(runSummary),
      latest: structuredClone(runs.find((r) => r.id === c.latestRunId) ?? null),
    };
  }

  async openCaseReferences(tenantId: string): Promise<OpenCaseReference[]> {
    return this.db.openCaseReferences(tenantId);
  }

  async caseIdsForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const l of this.db.links) if (l.tenantId === tenantId && signalIds.includes(l.signalId)) out[l.signalId] = l.caseId;
    return out;
  }
  async listEvidence(tenantId: string, { limit }: ListOptions): Promise<EvidenceItem[]> {
    const latest = new Set(this.db.cases.filter((c) => c.tenantId === tenantId && c.latestRunId).map((c) => c.latestRunId));
    return this.db.runs
      .filter((r) => r.tenantId === tenantId && latest.has(r.id))
      .flatMap((r) => r.evidence.map((e, position) => ({ e, position })))
      .sort((a, b) =>
        a.e.observedAt !== b.e.observedAt ? (a.e.observedAt < b.e.observedAt ? 1 : -1)
          : a.e.caseId !== b.e.caseId ? a.e.caseId.localeCompare(b.e.caseId) : a.position - b.position,
      )
      .slice(0, clampLimit(limit))
      .map(({ e }) => structuredClone(e));
  }

}

/** In-memory extraction repository sharing a `MemoryDb`. */
export class InMemoryExtractionRepository implements ExtractionRepository {
  constructor(readonly db: MemoryDb) {}

  record(tenantId: string, signalId: string, outcome: ExtractionOutcome, event: EventDraft): Promise<StoredExtraction> {
    const db = this.db;
    return db.transaction(async () => {
      if (!db.signals.some((s) => s.tenantId === tenantId && s.id === signalId)) {
        throw new ForeignKeyViolationError("ai_extractions_signal_fk");
      }
      if (event.signalId !== signalId) throw new Error("event signalId must match the extraction signal");
      const n = db.extractions.filter((x) => x.tenantId === tenantId && x.signalId === signalId).length + 1;
      const row: StoredExtraction = {
        ...structuredClone(outcome),
        tenantId,
        id: `${signalId}-AI${n}`,
        signalId,
        createdAt: event.occurredAt,
        dataMode: "synthetic",
      };
      db.extractions.push(row);
      db.insertEvents(tenantId, [event]);
      return structuredClone(row);
    });
  }

  async latestForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, StoredExtraction>> {
    const out: Record<string, StoredExtraction> = {};
    for (const x of this.db.extractions) {
      if (x.tenantId !== tenantId || !signalIds.includes(x.signalId)) continue;
      // Later rows were appended later.
      out[x.signalId] = structuredClone(x);
    }
    return out;
  }

  async listExtractions(tenantId: string, { limit }: ListOptions): Promise<StoredExtraction[]> {
    return this.db.extractions
      .filter((x) => x.tenantId === tenantId)
      .sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : b.id.localeCompare(a.id)))
      .slice(0, clampLimit(limit))
      .map((x) => structuredClone(x));
  }

  async completedSignalIds(tenantId: string, key: ExtractionKey): Promise<Set<string>> {
    return new Set(
      this.db.extractions
        .filter(
          (x) =>
            x.tenantId === tenantId && x.status === "completed" && x.provider === key.provider &&
            x.model === key.model && x.promptVersion === key.promptVersion,
        )
        .map((x) => x.signalId),
    );
  }
}
