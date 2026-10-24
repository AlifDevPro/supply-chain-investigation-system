import { randomUUID } from "node:crypto";
import type { SqlClient, SqlQueryable, SqlRow } from "@/lib/db/sql";
import { investigationEventSchema, type InvestigationEvent } from "@/lib/domain/events";
import {
  signalRecordSchema,
  triageReasonCodeSchema,
  type SignalRecord,
  type TriageResult,
} from "@/lib/domain/processing";
import { normalizedSignalSchema, type ReferenceKey } from "@/lib/domain/signal-input";
import type { SignalRef } from "@/lib/ingestion/dedupe";
import {
  clampLimit,
  ForeignKeyViolationError,
  UniqueViolationError,
  type EventDraft,
  type ListOptions,
  type Rejection,
  type SignalRepository,
  type SignalTx,
  type StoredSignal,
} from "./types";

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
// Params are bound as text and cast server-side: the postgres driver would otherwise JSON-encode an
// already-serialised string a second time when the parameter is inferred as jsonb.
const json = (value: unknown): string => JSON.stringify(value);

function sqlState(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Columns of the UI read model. Never selects payload columns (`raw`, `normalized`). */
const RECORD_COLUMNS = `s.id, s.correlation_id, s.received_at, s.source_type, s.source_system, s.label, s.processing_status,
  s.dedupe_status, s.duplicate_of, s.revision_of, s.triage_outcome, s.triage_reason_codes, s.requires_review,
  s.triage_rule_version, s.data_mode, cs.case_id`;
const WITH_CASE = "signals s left join case_signals cs on cs.tenant_id = s.tenant_id and cs.signal_id = s.id";

function rowToRecord(row: SqlRow): SignalRecord {
  return signalRecordSchema.parse({
    id: row.id,
    correlationId: row.correlation_id,
    receivedAt: iso(row.received_at),
    sourceType: str(row.source_type),
    sourceSystem: str(row.source_system),
    label: str(row.label),
    processingStatus: row.processing_status,
    dedupeStatus: str(row.dedupe_status),
    duplicateOf: str(row.duplicate_of),
    revisionOf: str(row.revision_of),
    triageOutcome: str(row.triage_outcome),
    reasonCodes: Array.isArray(row.triage_reason_codes) ? row.triage_reason_codes : [],
    requiresReview: row.requires_review === true,
    ruleVersion: str(row.triage_rule_version),
    caseId: str(row.case_id),
    dataMode: row.data_mode,
  });
}

function rowToEvent(row: SqlRow): InvestigationEvent {
  return investigationEventSchema.parse({
    id: row.id,
    sequence: Number(row.sequence),
    tenantId: row.tenant_id,
    caseId: str(row.case_id),
    signalId: str(row.signal_id),
    correlationId: row.correlation_id,
    type: row.type,
    stage: row.stage,
    status: row.status,
    occurredAt: iso(row.occurred_at),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    method: row.method_kind === null ? null : { kind: row.method_kind, name: row.method_name },
    retryCount: Number(row.retry_count),
    errorClass: str(row.error_class),
    metadata: row.metadata,
    dataMode: row.data_mode,
  });
}

function rowToRef(row: SqlRow): SignalRef {
  return {
    id: String(row.id),
    contentHash: String(row.content_hash),
    fingerprint: String(row.fingerprint),
    receivedAt: iso(row.received_at),
    sourceRecordId: str(row.source_record_id),
  };
}

const REF_COLUMNS = "id, content_hash, fingerprint, received_at, source_record_id";
const CANONICAL = "dedupe_status in ('unique', 'revision')";

const REFERENCE_PATHS: Record<ReferenceKey, string> = {
  purchaseOrder: "purchaseOrder",
  material: "material",
  shipment: "shipment",
  lot: "lot",
  productionOrder: "productionOrder",
};

/** Appends events in the caller's transaction. Shared by the signal and investigation repositories. */
export async function insertEventRows(q: SqlQueryable, tenantId: string, drafts: readonly EventDraft[]): Promise<InvestigationEvent[]> {
  const out: InvestigationEvent[] = [];
  for (const d of drafts) {
    const id = `evt-${randomUUID()}`;
    try {
      const rows = await q.query(
        `insert into signal_events (
           id, tenant_id, case_id, signal_id, correlation_id, type, stage, status, occurred_at,
           duration_ms, method_kind, method_name, retry_count, error_class, metadata, data_mode
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::text::jsonb, $16)
         returning sequence`,
        [
          id, tenantId, d.caseId, d.signalId, d.correlationId, d.type, d.stage, d.status, d.occurredAt,
          d.durationMs === null ? null : Math.round(d.durationMs),
          d.method?.kind ?? null, d.method?.name ?? null, d.retryCount, d.errorClass,
          json(d.metadata), d.dataMode,
        ],
      );
      out.push({ ...d, id, tenantId, sequence: Number(rows[0]?.sequence) });
    } catch (error) {
      if (sqlState(error) === "23503") throw new ForeignKeyViolationError(tenantId);
      throw error;
    }
  }
  return out;
}

function makeTx(q: SqlQueryable): SignalTx {
  return {
    async nextSignalId() {
      const rows = await q.query("select nextval('signal_number_seq') as n");
      return `SIG-${String(rows[0]?.n)}`;
    },
    async lockDedupeKey(tenantId, key) {
      await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${tenantId}|${key}`]);
    },
    async findCanonicalByRecord(tenantId, sourceSystem, recordId) {
      const rows = await q.query(
        `select ${REF_COLUMNS} from signals
          where tenant_id = $1 and source_system = $2 and source_record_id = $3 and ${CANONICAL}
          order by received_at asc, id asc`,
        [tenantId, sourceSystem, recordId],
      );
      return rows.map(rowToRef);
    },
    async findCanonicalByFingerprint(tenantId, fingerprint) {
      const rows = await q.query(
        `select ${REF_COLUMNS} from signals
          where tenant_id = $1 and fingerprint = $2 and ${CANONICAL}
          order by received_at desc, id desc limit 20`,
        [tenantId, fingerprint],
      );
      return rows.map(rowToRef);
    },
    async findCanonicalByReferences(tenantId, references, limit) {
      const entries = Object.entries(references) as Array<[ReferenceKey, string]>;
      if (entries.length === 0) return [];
      const params: unknown[] = [tenantId];
      const conditions = entries.map(([key, value]) => {
        params.push(value);
        return `normalized -> 'references' ->> '${REFERENCE_PATHS[key]}' = $${params.length}`;
      });
      params.push(clampLimit(limit));
      const rows = await q.query(
        `select ${REF_COLUMNS} from signals
          where tenant_id = $1 and ${CANONICAL} and (${conditions.join(" or ")})
          order by received_at desc, id desc limit $${params.length}`,
        params,
      );
      return rows.map(rowToRef);
    },
    async insertSignal(s) {
      try {
        await q.query(
          `insert into signals (
             id, tenant_id, correlation_id, received_at, processing_status,
             source_type, source_system, source_record_id, label, normalized, raw,
             content_hash, fingerprint, dedupe_status, dedupe_rule, duplicate_of, revision_of, possibly_related,
             triage_outcome, triage_rule_id, triage_rule_version, triage_reason_codes, related_case_ids,
             requires_review, rejection, data_mode
           ) values (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10::text::jsonb, $11::text::jsonb,
             $12, $13, $14, $15, $16, $17, $18::text::jsonb,
             $19, $20, $21, $22::text::jsonb, $23::text::jsonb,
             $24, $25::text::jsonb, $26
           )`,
          [
            s.id, s.tenantId, s.correlationId, s.receivedAt, s.processingStatus,
            s.sourceType, s.sourceSystem, s.sourceRecordId, s.label,
            s.normalized === null ? null : json(s.normalized),
            s.raw === null || s.raw === undefined ? null : json(s.raw),
            s.contentHash, s.fingerprint, s.dedupeStatus, s.dedupeRule, s.duplicateOf, s.revisionOf,
            json(s.possiblyRelated),
            s.triage?.outcome ?? null, s.triage?.ruleId ?? null, s.triage?.ruleVersion ?? null,
            json(s.triage?.reasonCodes ?? []), json(s.relatedCaseIds),
            s.requiresReview,
            s.rejection === null ? null : json(s.rejection),
            s.dataMode,
          ],
        );
      } catch (error) {
        const state = sqlState(error);
        if (state === "23505") throw new UniqueViolationError("signals_canonical_record_content_uq");
        if (state === "23503") throw new ForeignKeyViolationError(s.tenantId);
        throw error;
      }
    },
    insertEvents: (tenantId, drafts) => insertEventRows(q, tenantId, drafts),
  };
}

/** Repository over `SqlClient`. Every read and write names the tenant; no method exists without one. */
export class PostgresSignalRepository implements SignalRepository {
  constructor(private readonly client: SqlClient) {}

  async ensureTenant(id: string, name: string): Promise<void> {
    await this.client.query("insert into tenants (id, name) values ($1, $2) on conflict (id) do nothing", [id, name]);
  }

  transaction<T>(fn: (tx: SignalTx) => Promise<T>): Promise<T> {
    return this.client.transaction((q) => fn(makeTx(q)));
  }

  async listSignals(tenantId: string, { limit }: ListOptions): Promise<SignalRecord[]> {
    const rows = await this.client.query(
      `select ${RECORD_COLUMNS} from ${WITH_CASE} where s.tenant_id = $1 order by s.received_at desc, s.id desc limit $2`,
      [tenantId, clampLimit(limit)],
    );
    return rows.map(rowToRecord);
  }

  async getSignal(tenantId: string, id: string): Promise<StoredSignal | null> {
    const rows = await this.client.query(
      `select s.*, cs.case_id from ${WITH_CASE} where s.tenant_id = $1 and s.id = $2`,
      [tenantId, id],
    );
    const row = rows[0];
    if (!row) return null;
    const record = rowToRecord(row);
    const normalized = row.normalized === null ? null : normalizedSignalSchema.parse(row.normalized);
    const reasonCodes = triageReasonCodeSchema.array().parse(record.reasonCodes);
    const triage: TriageResult | null =
      record.triageOutcome === null
        ? null
        : {
            outcome: record.triageOutcome,
            ruleId: String(row.triage_rule_id),
            ruleVersion: String(row.triage_rule_version),
            reasonCodes,
            requiresReview: record.requiresReview,
            relatedCaseIds: Array.isArray(row.related_case_ids) ? (row.related_case_ids as string[]) : [],
          };
    return {
      ...record,
      tenantId: String(row.tenant_id),
      sourceRecordId: str(row.source_record_id),
      normalized,
      raw: row.raw ?? null,
      contentHash: str(row.content_hash),
      fingerprint: str(row.fingerprint),
      dedupeRule: str(row.dedupe_rule),
      possiblyRelated: Array.isArray(row.possibly_related) ? (row.possibly_related as string[]) : [],
      relatedCaseIds: Array.isArray(row.related_case_ids) ? (row.related_case_ids as string[]) : [],
      triage,
      rejection: (row.rejection ?? null) as Rejection | null,
    };
  }

  async listEvents(tenantId: string, options: ListOptions & { correlationId?: string }): Promise<InvestigationEvent[]> {
    const params: unknown[] = [tenantId];
    let where = "tenant_id = $1";
    if (options.correlationId) {
      params.push(options.correlationId);
      where += ` and correlation_id = $${params.length}`;
    }
    params.push(clampLimit(options.limit));
    const rows = await this.client.query(
      `select * from signal_events where ${where} order by occurred_at desc, sequence desc limit $${params.length}`,
      params,
    );
    return rows.map(rowToEvent);
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
