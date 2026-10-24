import type { SqlClient, SqlRow } from "@/lib/db/sql";
import type { ExtractionOutcome } from "@/lib/ai/extract";
import {
  storedComparisonSchema,
  storedFieldsSchema,
  storedRejectedSchema,
  type ExtractionKey,
  type ExtractionRepository,
  type StoredExtraction,
} from "./extraction-types";
import { insertEventRows } from "./postgres";
import { clampLimit, ForeignKeyViolationError, UniqueViolationError, type EventDraft, type ListOptions } from "./types";

const COLUMNS =
  "tenant_id, id, signal_id, provider, model, prompt_version, status, failure, fields, rejected, comparison, " +
  "input_chars, output_chars, input_tokens, output_tokens, latency_ms, attempts, created_at";

const int = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

function rowToExtraction(row: SqlRow): StoredExtraction {
  const provider = String(row.provider);
  const status = String(row.status);
  if (provider !== "mock" && provider !== "ollama") throw new Error("unexpected provider");
  if (!["completed", "invalid_output", "unavailable", "timeout"].includes(status)) throw new Error("unexpected status");
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    signalId: String(row.signal_id),
    provider,
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    status: status as StoredExtraction["status"],
    failure: row.failure === null ? null : String(row.failure),
    fields: storedFieldsSchema.parse(row.fields),
    rejected: storedRejectedSchema.parse(row.rejected),
    comparison: storedComparisonSchema.parse(row.comparison),
    inputChars: Number(row.input_chars),
    outputChars: Number(row.output_chars),
    inputTokens: int(row.input_tokens),
    outputTokens: int(row.output_tokens),
    latencyMs: Number(row.latency_ms),
    attempts: Number(row.attempts),
    createdAt: iso(row.created_at),
    dataMode: "synthetic",
  };
}

export class PostgresExtractionRepository implements ExtractionRepository {
  constructor(private readonly client: SqlClient) {}

  async record(tenantId: string, signalId: string, outcome: ExtractionOutcome, event: EventDraft): Promise<StoredExtraction> {
    if (event.signalId !== signalId) throw new Error("event signalId must match the extraction signal");
    try {
      return await this.client.transaction(async (q) => {
        // Serializes id allocation for one signal.
        await q.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`extraction|${tenantId}|${signalId}`]);
        const counted = await q.query("select count(*)::int as n from ai_extractions where tenant_id = $1 and signal_id = $2", [
          tenantId,
          signalId,
        ]);
        const id = `${signalId}-AI${Number(counted[0]?.n ?? 0) + 1}`;
        const rows = await q.query(
          `insert into ai_extractions (tenant_id, id, signal_id, provider, model, prompt_version, status, failure, fields,
             rejected, comparison, input_chars, output_chars, input_tokens, output_tokens, latency_ms, attempts, created_at,
             data_mode)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::text::jsonb, $11::text::jsonb, $12, $13, $14, $15,
             $16, $17, $18, 'synthetic')
           returning ${COLUMNS}`,
          [
            tenantId, id, signalId, outcome.provider, outcome.model, outcome.promptVersion, outcome.status, outcome.failure,
            JSON.stringify(outcome.fields), JSON.stringify(outcome.rejected), JSON.stringify(outcome.comparison),
            outcome.inputChars, outcome.outputChars, outcome.inputTokens, outcome.outputTokens, outcome.latencyMs,
            outcome.attempts, event.occurredAt,
          ],
        );
        await insertEventRows(q, tenantId, [event]);
        return rowToExtraction(rows[0]!);
      });
    } catch (error) {
      const state = (error as { code?: unknown } | null)?.code;
      if (state === "23503") throw new ForeignKeyViolationError("ai_extractions_signal_fk");
      if (state === "23505") throw new UniqueViolationError("ai_extractions_pkey");
      throw error;
    }
  }

  async latestForSignals(tenantId: string, signalIds: readonly string[]): Promise<Record<string, StoredExtraction>> {
    if (signalIds.length === 0) return {};
    const rows = await this.client.query(
      `select distinct on (signal_id) ${COLUMNS} from ai_extractions
       where tenant_id = $1 and signal_id in (select jsonb_array_elements_text($2::text::jsonb))
       order by signal_id, created_at desc, id desc`,
      [tenantId, JSON.stringify(signalIds)],
    );
    return Object.fromEntries(rows.map((r) => [String(r.signal_id), rowToExtraction(r)]));
  }

  async completedSignalIds(tenantId: string, key: ExtractionKey): Promise<Set<string>> {
    const rows = await this.client.query(
      `select distinct signal_id from ai_extractions
       where tenant_id = $1 and status = 'completed' and provider = $2 and model = $3 and prompt_version = $4`,
      [tenantId, key.provider, key.model, key.promptVersion],
    );
    return new Set(rows.map((r) => String(r.signal_id)));
  }

  async listExtractions(tenantId: string, { limit }: ListOptions): Promise<StoredExtraction[]> {
    const rows = await this.client.query(
      `select ${COLUMNS} from ai_extractions where tenant_id = $1 order by created_at desc, id desc limit $2`,
      [tenantId, clampLimit(limit)],
    );
    return rows.map(rowToExtraction);
  }
}
