import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signalInputSchema, type SignalInput } from "@/lib/domain/signal-input";
import { ingestAndInvestigate } from "@/lib/investigation/ingest";
import type { InvestigationDeps } from "@/lib/investigation/run";
import type { PipelineDeps } from "@/lib/ingestion/pipeline";
import type { EventDraft, SignalRepository } from "@/lib/store/types";
import type { ConnectorId, ConnectorRunRow, IntegrationRepository } from "@/lib/store/integration-types";
import { connectorConfig, isConfigured, type ConnectorConfig } from "./config";
import { AdapterFetchError, fetchAdapterJson, type HttpStatusClass } from "./fetch";
import type { AppEnv } from "@/lib/env";

const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.string().optional(),
});

const envelopeSchema = z.object({
  kind: z.enum(["signals", "health"]).default("signals"),
  signals: z.array(z.unknown()).max(5).optional(),
  health: healthSchema.optional(),
});

export interface PollDeps {
  env: AppEnv;
  tenantId: string;
  signals: SignalRepository;
  integrations: IntegrationRepository;
  pipeline: PipelineDeps & { investigation: InvestigationDeps };
}

export interface PollResult {
  run: ConnectorRunRow;
  configured: boolean;
}

function draft(
  type: EventDraft["type"],
  status: EventDraft["status"],
  correlationId: string,
  occurredAt: string,
  durationMs: number | null,
  metadata: Record<string, string | number | boolean>,
  errorClass: EventDraft["errorClass"] = null,
): EventDraft {
  return {
    signalId: null,
    caseId: null,
    correlationId,
    type,
    stage: "integration",
    status,
    occurredAt,
    durationMs,
    method: { kind: "system", name: "connector.poll.v1" },
    retryCount: 0,
    errorClass,
    metadata,
    dataMode: "synthetic",
  };
}

function parseSignals(body: unknown): { signals: SignalInput[]; healthOnly: boolean } {
  const envelope = envelopeSchema.safeParse(body);
  if (envelope.success && envelope.data.kind === "health") {
    const health = healthSchema.safeParse(envelope.data.health ?? body);
    if (!health.success) throw new AdapterFetchError("2xx", "validation_error", "Invalid health snapshot.");
    return { signals: [], healthOnly: true };
  }
  // Accept either { kind, signals } or a bare SignalInput / array of SignalInput.
  let candidates: unknown[] = [];
  if (envelope.success && envelope.data.signals) candidates = envelope.data.signals;
  else if (Array.isArray(body)) candidates = body;
  else candidates = [body];

  const signals: SignalInput[] = [];
  for (const item of candidates) {
    const parsed = signalInputSchema.safeParse(item);
    if (!parsed.success) throw new AdapterFetchError("2xx", "validation_error", "Connector payload failed signal validation.");
    signals.push(parsed.data);
  }
  return { signals, healthOnly: false };
}

async function recordRun(
  deps: PollDeps,
  row: ConnectorRunRow,
  correlationId: string,
  eventType: "connector.poll_completed" | "connector.poll_failed",
): Promise<void> {
  await deps.integrations.insertConnectorRun(row);
  await deps.signals.transaction((tx) =>
    tx.insertEvents(deps.tenantId, [
      draft(
        eventType,
        row.status === "failed" ? "failed" : "completed",
        correlationId,
        row.at,
        row.durationMs,
        {
          connector: row.connectorId,
          runId: row.id,
          signalsIngested: row.signalsIngested,
          ...(row.httpStatusClass ? { httpStatusClass: row.httpStatusClass } : {}),
        },
        row.errorClass,
      ),
    ]),
  );
}

/** Polls one connector. Unconfigured connectors record a skipped run (never "healthy"). */
export async function pollConnector(
  connectorId: ConnectorId,
  deps: PollDeps,
  actorUserId: string | null,
): Promise<PollResult> {
  const config = connectorConfig(deps.env, connectorId);
  const runId = `CONN-${randomUUID().slice(0, 12)}`;
  const correlationId = `corr-${runId}`;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  await deps.signals.transaction((tx) =>
    tx.insertEvents(deps.tenantId, [
      draft("connector.poll_started", "completed", correlationId, startedAt, null, {
        connector: connectorId,
        runId,
        configured: isConfigured(config),
      }),
    ]),
  );

  if (!isConfigured(config)) {
    const run: ConnectorRunRow = {
      tenantId: deps.tenantId,
      id: runId,
      connectorId,
      status: "skipped",
      httpStatusClass: null,
      signalsIngested: 0,
      errorClass: null,
      durationMs: Date.now() - started,
      actorUserId,
      metadata: { reason: "not_configured" },
      at: new Date().toISOString(),
      dataMode: "synthetic",
    };
    await recordRun(deps, run, correlationId, "connector.poll_completed");
    return { run, configured: false };
  }

  try {
    const fetched = await fetchAdapterJson({
      baseUrl: config.baseUrl!,
      path: config.path,
      apiKey: config.apiKey!,
    });
    const { signals, healthOnly } = parseSignals(fetched.body);
    let ingested = 0;
    for (const signal of signals) {
      const text = JSON.stringify(signal);
      const result = await ingestAndInvestigate(deps.tenantId, text, deps.pipeline);
      if (result.outcome.kind !== "rejected") ingested += 1;
    }
    const run: ConnectorRunRow = {
      tenantId: deps.tenantId,
      id: runId,
      connectorId,
      status: "completed",
      httpStatusClass: fetched.statusClass,
      signalsIngested: ingested,
      errorClass: null,
      durationMs: Date.now() - started,
      actorUserId,
      metadata: healthOnly ? { healthOnly: true } : { signals: signals.length },
      at: new Date().toISOString(),
      dataMode: "synthetic",
    };
    await recordRun(deps, run, correlationId, "connector.poll_completed");
    return { run, configured: true };
  } catch (error) {
    const httpStatusClass: HttpStatusClass | null = error instanceof AdapterFetchError ? error.httpStatusClass : "network";
    const errorClass =
      error instanceof AdapterFetchError ? error.errorClass : ("internal_error" as const);
    const run: ConnectorRunRow = {
      tenantId: deps.tenantId,
      id: runId,
      connectorId,
      status: "failed",
      httpStatusClass,
      signalsIngested: 0,
      errorClass,
      durationMs: Date.now() - started,
      actorUserId,
      metadata: { reason: errorClass },
      at: new Date().toISOString(),
      dataMode: "synthetic",
    };
    await recordRun(deps, run, correlationId, "connector.poll_failed");
    return { run, configured: true };
  }
}

export async function pollAllConnectors(deps: PollDeps, actorUserId: string | null): Promise<PollResult[]> {
  const ids: ConnectorId[] = ["mailbox", "erp_po", "carrier"];
  const out: PollResult[] = [];
  for (const id of ids) out.push(await pollConnector(id, deps, actorUserId));
  return out;
}

export function describeConnector(config: ConnectorConfig): { id: ConnectorId; label: string; configured: boolean } {
  return { id: config.id, label: config.label, configured: isConfigured(config) };
}
