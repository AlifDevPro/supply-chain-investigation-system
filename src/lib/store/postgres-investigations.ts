import type { SqlClient, SqlQueryable, SqlRow } from "@/lib/db/sql";
import {
  caseStateSchema,
  claimSchema,
  conflictSchema,
  deliveryRiskSchema,
  entityEdgeSchema,
  entityNodeSchema,
  evidenceItemSchema,
  impactCalculationSchema,
  severitySchema,
  unknownItemSchema,
  type RunSummary,
} from "@/lib/domain";
import type { OpenCaseReference } from "@/lib/ingestion/triage";
import { z } from "zod";
import {
  OPEN_CASE_STATES,
  runSummary,
  type CaseDetailRecord,
  type CaseLink,
  type CaseListItem,
  type InvestigationRepository,
  type InvestigationTx,
  type LinkReason,
  type StoredCase,
  type StoredRun,
} from "./investigation-types";
import { insertEventRows } from "./postgres";
import { clampLimit, ForeignKeyViolationError, UniqueViolationError, type ListOptions } from "./types";

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
// Bound as text and cast server-side; see postgres.ts.
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

const referenceKeysSchema = z.record(z.string(), z.string());
const retrievalSchema = z.object({ calls: z.number(), rows: z.number(), truncated: z.boolean(), budgetExhausted: z.boolean() });
const entitiesSchema = z.object({ nodes: z.array(entityNodeSchema), edges: z.array(entityEdgeSchema) });
const triggerSchema = z.enum(["signal", "related_signal", "operator_open", "operator_rerun", "backfill"]);

function rowToCase(row: SqlRow): StoredCase {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    state: caseStateSchema.parse(row.state),
    severity: severitySchema.parse(row.severity),
    ownerName: String(row.owner_name),
    ownerRole: String(row.owner_role),
    nextAction: String(row.next_action),
    requiresReview: row.requires_review === true,
    reviewReason: str(row.review_reason),
    origin: row.origin === "operator" ? "operator" : "automatic",
    referenceKeys: referenceKeysSchema.parse(row.reference_keys),
    latestRunId: str(row.latest_run_id),
    openedAt: iso(row.opened_at),
    updatedAt: iso(row.updated_at),
    dataMode: "synthetic",
  };
}

const RUN_COLUMNS = "id, case_id, tenant_id, run_number, trigger, trigger_signal_id, rule_versions, retrieval, entities, started_at, finished_at";

function rowToRunHead(row: SqlRow) {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    caseId: String(row.case_id),
    runNumber: Number(row.run_number),
    trigger: triggerSchema.parse(row.trigger),
    triggerSignalId: str(row.trigger_signal_id),
    ruleVersions: z.record(z.string(), z.string()).parse(row.rule_versions),
    retrieval: retrievalSchema.parse(row.retrieval),
    entities: entitiesSchema.parse(row.entities),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
  };
}

const casePersistColumns = (c: StoredCase) => [
  c.tenantId, c.id, c.title, c.summary, c.state, c.severity, c.ownerName, c.ownerRole, c.nextAction,
  c.requiresReview, c.reviewReason, json(c.referenceKeys), c.latestRunId, c.updatedAt,
];

async function openCaseReferences(q: SqlQueryable, tenantId: string): Promise<OpenCaseReference[]> {
  const rows = await q.query(
    `select id, reference_keys from cases where tenant_id = $1 and state in (select jsonb_array_elements_text($2::text::jsonb))
      order by updated_at desc, id desc limit 200`,
    [tenantId, json(OPEN_CASE_STATES)],
  );
  return rows.map((r) => ({ caseId: String(r.id), references: referenceKeysSchema.parse(r.reference_keys) }));
}

async function insertChildren(q: SqlQueryable, run: StoredRun) {
  const base = [run.tenantId, run.id, run.caseId];
  if (run.evidence.length > 0) {
    await q.query(
      `insert into evidence_items (tenant_id, run_id, case_id, id, position, source_system, source_type, source_table,
         source_record_id, title, excerpt, field_location, observed_at, source_reported_at, record_version,
         extraction_method, verification_status, data_mode)
       select $1, $2, $3, x.id, x.position, x.source_system, x.source_type, x.source_table, x.source_record_id, x.title,
              x.excerpt, x.field_location, x.observed_at, x.source_reported_at, x.record_version, x.extraction_method,
              x.verification_status, 'synthetic'
         from jsonb_to_recordset($4::text::jsonb) as x(id text, position int, source_system text, source_type text,
              source_table text, source_record_id text, title text, excerpt text, field_location text,
              observed_at timestamptz, source_reported_at timestamptz, record_version text, extraction_method text,
              verification_status text)`,
      [...base, json(run.evidence.map((e, position) => ({
        id: e.id, position, source_system: e.sourceSystem, source_type: e.sourceType, source_table: e.sourceTable ?? null,
        source_record_id: e.sourceRecordId, title: e.title, excerpt: e.excerpt, field_location: e.fieldLocation,
        observed_at: e.observedAt, source_reported_at: e.sourceReportedAt, record_version: e.recordVersion,
        extraction_method: e.extractionMethod, verification_status: e.verificationStatus,
      })))],
    );
  }
  if (run.claims.length > 0) {
    await q.query(
      `insert into claims (tenant_id, run_id, case_id, id, position, statement, state, basis, evidence_ids, data_mode)
       select $1, $2, $3, x.id, x.position, x.statement, x.state, x.basis, x.evidence_ids, 'synthetic'
         from jsonb_to_recordset($4::text::jsonb) as x(id text, position int, statement text, state text, basis text, evidence_ids jsonb)`,
      [...base, json(run.claims.map((c, position) => ({ id: c.id, position, statement: c.statement, state: c.state, basis: c.basis, evidence_ids: c.evidenceIds })))],
    );
  }
  if (run.unknowns.length > 0) {
    await q.query(
      `insert into unknowns (tenant_id, run_id, case_id, id, position, description, why_it_matters, suggested_retrieval, data_mode)
       select $1, $2, $3, x.id, x.position, x.description, x.why_it_matters, x.suggested_retrieval, 'synthetic'
         from jsonb_to_recordset($4::text::jsonb) as x(id text, position int, description text, why_it_matters text, suggested_retrieval text)`,
      [...base, json(run.unknowns.map((u, position) => ({ id: u.id, position, description: u.description, why_it_matters: u.whyItMatters, suggested_retrieval: u.suggestedRetrieval })))],
    );
  }
  if (run.conflicts.length > 0) {
    await q.query(
      `insert into conflicts (tenant_id, run_id, case_id, id, position, description, sides, data_mode)
       select $1, $2, $3, x.id, x.position, x.description, x.sides, 'synthetic'
         from jsonb_to_recordset($4::text::jsonb) as x(id text, position int, description text, sides jsonb)`,
      [...base, json(run.conflicts.map((c, position) => ({ id: c.id, position, description: c.description, sides: c.sides })))],
    );
  }
  const impacts = [
    run.shortage && { kind: "shortage", value: run.shortage },
    run.deliveryRisk && { kind: "delivery_risk", value: run.deliveryRisk },
  ].filter((x) => x !== null);
  for (const impact of impacts) {
    await q.query(
      `insert into impact_calculations (tenant_id, run_id, case_id, id, kind, rule_version, status, calculated_at, result, data_mode)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, 'synthetic')`,
      [...base, `${run.id}-${impact.kind}`, impact.kind, impact.value.ruleVersion, impact.value.status, impact.value.calculatedAt, json(impact.value)],
    );
  }
}

function rowToEvidence(e: SqlRow, caseId: string) {
  return evidenceItemSchema.parse({
    id: e.id, caseId, sourceSystem: e.source_system, sourceRecordId: e.source_record_id, sourceType: e.source_type,
    sourceTable: str(e.source_table), title: e.title, excerpt: e.excerpt, fieldLocation: e.field_location,
    observedAt: iso(e.observed_at), sourceReportedAt: e.source_reported_at === null ? null : iso(e.source_reported_at),
    recordVersion: e.record_version, extractionMethod: e.extraction_method, verificationStatus: e.verification_status,
    dataMode: e.data_mode,
  });
}

async function loadRun(q: SqlQueryable, tenantId: string, runId: string): Promise<StoredRun | null> {
  const heads = await q.query(`select ${RUN_COLUMNS} from investigation_runs where tenant_id = $1 and id = $2`, [tenantId, runId]);
  const head = heads[0];
  if (!head) return null;
  const caseId = String(head.case_id);
  const params = [tenantId, runId];
  const [evidence, claims, unknowns, conflicts, impacts] = await Promise.all([
    q.query("select * from evidence_items where tenant_id = $1 and run_id = $2 order by position", params),
    q.query("select * from claims where tenant_id = $1 and run_id = $2 order by position", params),
    q.query("select * from unknowns where tenant_id = $1 and run_id = $2 order by position", params),
    q.query("select * from conflicts where tenant_id = $1 and run_id = $2 order by position", params),
    q.query("select kind, result from impact_calculations where tenant_id = $1 and run_id = $2", params),
  ]);
  const shortage = impacts.find((i) => i.kind === "shortage");
  const delivery = impacts.find((i) => i.kind === "delivery_risk");
  return {
    ...rowToRunHead(head),
    evidence: evidence.map((e) => rowToEvidence(e, caseId)),
    claims: claims.map((c) =>
      claimSchema.parse({ id: c.id, caseId, statement: c.statement, state: c.state, basis: c.basis, evidenceIds: c.evidence_ids, dataMode: c.data_mode }),
    ),
    unknowns: unknowns.map((u) =>
      unknownItemSchema.parse({ id: u.id, caseId, description: u.description, whyItMatters: u.why_it_matters, suggestedRetrieval: u.suggested_retrieval, dataMode: u.data_mode }),
    ),
    conflicts: conflicts.map((c) => conflictSchema.parse({ id: c.id, caseId, description: c.description, sides: c.sides, dataMode: c.data_mode })),
    shortage: shortage ? impactCalculationSchema.parse(shortage.result) : null,
    deliveryRisk: delivery ? deliveryRiskSchema.parse(delivery.result) : null,
  };
}

function makeTx(q: SqlQueryable): InvestigationTx {
  return {
    async nextCaseId() {
      const rows = await q.query("select nextval('case_number_seq') as n");
      return `INV-${String(rows[0]?.n)}`;
    },
    async lockCaseDecisions(tenantId) {
      await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`case-decisions|${tenantId}`]);
    },
    async getCase(tenantId, caseId) {
      const rows = await q.query("select * from cases where tenant_id = $1 and id = $2", [tenantId, caseId]);
      return rows[0] ? rowToCase(rows[0]) : null;
    },
    async caseIdForSignal(tenantId, signalId) {
      const rows = await q.query("select case_id from case_signals where tenant_id = $1 and signal_id = $2", [tenantId, signalId]);
      return str(rows[0]?.case_id);
    },
    async linkedSignalIds(tenantId, caseId) {
      const rows = await q.query(
        "select signal_id from case_signals where tenant_id = $1 and case_id = $2 order by linked_at, signal_id",
        [tenantId, caseId],
      );
      return rows.map((r) => String(r.signal_id));
    },
    openCaseReferences: (tenantId) => openCaseReferences(q, tenantId),
    async insertCase(c) {
      await mapErrors(
        () =>
          q.query(
            `insert into cases (tenant_id, id, title, summary, state, severity, owner_name, owner_role, next_action,
               requires_review, review_reason, reference_keys, latest_run_id, updated_at, origin, opened_at, data_mode)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text::jsonb, $13, $14, $15, $16, 'synthetic')`,
            [...casePersistColumns(c), c.origin, c.openedAt],
          ),
        "cases",
      );
    },
    async updateCase(c) {
      const rows = await q.query(
        `update cases set title = $3, summary = $4, state = $5, severity = $6, owner_name = $7, owner_role = $8,
           next_action = $9, requires_review = $10, review_reason = $11, reference_keys = $12::text::jsonb,
           latest_run_id = $13, updated_at = $14
         where tenant_id = $1 and id = $2 returning id`,
        casePersistColumns(c),
      );
      if (rows.length === 0) throw new ForeignKeyViolationError(c.id);
    },
    async linkSignal(tenantId, link) {
      await mapErrors(
        () =>
          q.query(
            `insert into case_signals (tenant_id, case_id, signal_id, link_reason, linked_at, data_mode)
             values ($1, $2, $3, $4, $5, 'synthetic')`,
            [tenantId, link.caseId, link.signalId, link.linkReason, link.linkedAt],
          ),
        "case_signals",
      );
    },
    async nextRunNumber(tenantId, caseId) {
      const rows = await q.query(
        "select coalesce(max(run_number), 0) + 1 as n from investigation_runs where tenant_id = $1 and case_id = $2",
        [tenantId, caseId],
      );
      return Number(rows[0]?.n ?? 1);
    },
    async insertRun(run) {
      await mapErrors(async () => {
        await q.query(
          `insert into investigation_runs (tenant_id, id, case_id, run_number, trigger, trigger_signal_id, rule_versions,
             retrieval, entities, started_at, finished_at, data_mode)
           values ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8::text::jsonb, $9::text::jsonb, $10, $11, 'synthetic')`,
          [run.tenantId, run.id, run.caseId, run.runNumber, run.trigger, run.triggerSignalId, json(run.ruleVersions),
            json(run.retrieval), json(run.entities), run.startedAt, run.finishedAt],
        );
        await insertChildren(q, run);
      }, "investigation_runs");
    },
    insertEvents: (tenantId, drafts) => insertEventRows(q, tenantId, drafts),
  };
}

/** Investigation persistence over `SqlClient`. Every query names the tenant. */
export class PostgresInvestigationRepository implements InvestigationRepository {
  constructor(private readonly client: SqlClient) {}

  transaction<T>(fn: (tx: InvestigationTx) => Promise<T>): Promise<T> {
    return this.client.transaction((q) => fn(makeTx(q)));
  }

  async listCases(tenantId: string, { limit }: ListOptions): Promise<CaseListItem[]> {
    const rows = await this.client.query(
      `select c.*,
              (select count(*) from case_signals cs where cs.tenant_id = c.tenant_id and cs.case_id = c.id) as linked_signals,
              r.run_number,
              (select result from impact_calculations i where i.tenant_id = c.tenant_id and i.run_id = c.latest_run_id and i.kind = 'shortage') as shortage,
              (select result from impact_calculations i where i.tenant_id = c.tenant_id and i.run_id = c.latest_run_id and i.kind = 'delivery_risk') as delivery_risk,
              (select coalesce(jsonb_agg(cl.state order by cl.position), '[]'::jsonb) from claims cl
                 where cl.tenant_id = c.tenant_id and cl.run_id = c.latest_run_id) as claim_states,
              (select count(*) from unknowns x where x.tenant_id = c.tenant_id and x.run_id = c.latest_run_id) as n_unknowns,
              (select count(*) from conflicts x where x.tenant_id = c.tenant_id and x.run_id = c.latest_run_id) as n_conflicts
         from cases c
         left join investigation_runs r on r.tenant_id = c.tenant_id and r.id = c.latest_run_id
        where c.tenant_id = $1
        order by c.updated_at desc, c.id desc limit $2`,
      [tenantId, clampLimit(limit)],
    );
    return rows.map((row) => ({
      case: rowToCase(row),
      linkedSignals: Number(row.linked_signals),
      latest:
        row.latest_run_id === null || row.run_number === null
          ? null
          : {
              id: String(row.latest_run_id),
              runNumber: Number(row.run_number),
              shortage: row.shortage === null ? null : impactCalculationSchema.parse(row.shortage),
              deliveryRisk: row.delivery_risk === null ? null : deliveryRiskSchema.parse(row.delivery_risk),
              claimStates: z.array(claimSchema.shape.state).parse(row.claim_states),
              unknowns: Number(row.n_unknowns),
              conflicts: Number(row.n_conflicts),
            },
    }));
  }

  async getCase(tenantId: string, caseId: string): Promise<CaseDetailRecord | null> {
    const rows = await this.client.query("select * from cases where tenant_id = $1 and id = $2", [tenantId, caseId]);
    const row = rows[0];
    if (!row) return null;
    const c = rowToCase(row);
    const [links, runRows] = await Promise.all([
      this.client.query(
        "select case_id, signal_id, link_reason, linked_at from case_signals where tenant_id = $1 and case_id = $2 order by linked_at, signal_id",
        [tenantId, caseId],
      ),
      this.client.query(
        `select ${RUN_COLUMNS},
                (select count(*) from evidence_items x where x.tenant_id = r.tenant_id and x.run_id = r.id) as n_evidence,
                (select count(*) from claims x where x.tenant_id = r.tenant_id and x.run_id = r.id) as n_claims,
                (select count(*) from unknowns x where x.tenant_id = r.tenant_id and x.run_id = r.id) as n_unknowns,
                (select count(*) from conflicts x where x.tenant_id = r.tenant_id and x.run_id = r.id) as n_conflicts
           from investigation_runs r where tenant_id = $1 and case_id = $2 order by run_number desc limit 50`,
        [tenantId, caseId],
      ),
    ]);
    const runs: RunSummary[] = runRows.map((r) => {
      const head = rowToRunHead(r);
      return {
        id: head.id, runNumber: head.runNumber, trigger: head.trigger, triggerSignalId: head.triggerSignalId,
        startedAt: head.startedAt, finishedAt: head.finishedAt, ruleVersions: head.ruleVersions, retrieval: head.retrieval,
        counts: { evidence: Number(r.n_evidence), claims: Number(r.n_claims), unknowns: Number(r.n_unknowns), conflicts: Number(r.n_conflicts) },
      };
    });
    const latest = c.latestRunId ? await loadRun(this.client, tenantId, c.latestRunId) : null;
    return {
      case: c,
      links: links.map((l): CaseLink => ({
        caseId: String(l.case_id), signalId: String(l.signal_id), linkReason: l.link_reason as LinkReason, linkedAt: iso(l.linked_at),
      })),
      runs: runs.length > 0 ? runs : latest ? [runSummary(latest)] : [],
      latest,
    };
  }

  openCaseReferences(tenantId: string): Promise<OpenCaseReference[]> {
    return openCaseReferences(this.client, tenantId);
  }

  async caseIdsForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, string>> {
    if (signalIds.length === 0) return {};
    const rows = await this.client.query(
      "select signal_id, case_id from case_signals where tenant_id = $1 and signal_id in (select jsonb_array_elements_text($2::text::jsonb))",
      [tenantId, json(signalIds)],
    );
    return Object.fromEntries(rows.map((r) => [String(r.signal_id), String(r.case_id)]));
  }

  async listEvidence(tenantId: string, { limit }: ListOptions) {
    const rows = await this.client.query(
      `select x.* from evidence_items x
         join cases c on c.tenant_id = x.tenant_id and c.latest_run_id = x.run_id
        where x.tenant_id = $1
        order by x.observed_at desc, x.case_id, x.position limit $2`,
      [tenantId, clampLimit(limit)],
    );
    return rows.map((e) => rowToEvidence(e, String(e.case_id)));
  }
}
