import { createHash, timingSafeEqual } from "node:crypto";
import { MAX_PAYLOAD_BYTES } from "@/lib/domain/signal-input";
import { logEvent } from "@/lib/log";
import type { SignalRepository } from "@/lib/store/types";
import type { ExtractionRunOutcome } from "@/lib/investigation/extraction";
import { ingestAndInvestigate } from "@/lib/investigation/ingest";
import type { InvestigationDeps, InvestigationOutcome } from "@/lib/investigation/run";
import type { Clock, ProcessOutcome } from "./pipeline";
import { FixedWindowRateLimiter } from "./rate-limit";
import type { CaseReferenceSource } from "./triage";

export interface IngestDeps {
  /** Configured ingest key; `undefined` means ingestion is disabled. */
  apiKey: string | undefined;
  /** The tenant this key maps to. Decided by the server, never by the request. */
  tenantId: string;
  /** `null` when no store is configured (DATA_SOURCE=fixtures). */
  getStore: () => Promise<{ repo: SignalRepository; caseIndex: CaseReferenceSource; investigation: InvestigationDeps } | null>;
  limiter: FixedWindowRateLimiter;
  authFailureLimiter: FixedWindowRateLimiter;
  clock?: Clock;
}

type ErrorCode =
  | "ingestion_disabled"
  | "store_unavailable"
  | "unauthorized"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "invalid_json"
  | "validation_failed";

const MESSAGES: Record<ErrorCode, string> = {
  ingestion_disabled: "Signal ingestion is not enabled on this server.",
  store_unavailable: "The signal store is unavailable. Nothing was stored. Retry later.",
  unauthorized: "A valid bearer key is required.",
  payload_too_large: "The request body exceeds the 16 KB limit.",
  unsupported_media_type: "Content-Type must be application/json.",
  rate_limited: "Too many requests. Retry later.",
  invalid_json: "The request body is not valid JSON.",
  validation_failed: "The signal failed validation. See issues for field paths and codes.",
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function errorResponse(status: number, code: ErrorCode, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return json(status, { error: { code, message: MESSAGES[code], ...extra } }, headers);
}

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest();

/** Constant-time comparison of equal-length digests, so neither content nor length leaks via timing. */
export function keysMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** Reads at most `limit` bytes. Returns null when the body is larger, without buffering the rest. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function successBody(
  outcome: Exclude<ProcessOutcome, { kind: "rejected" }>,
  investigation: InvestigationOutcome | null,
  extraction: ExtractionRunOutcome | null,
) {
  const triage = outcome.kind === "accepted" ? outcome.triage : null;
  return {
    signalId: outcome.signalId,
    correlationId: outcome.correlationId,
    status: outcome.kind === "duplicate" ? "duplicate" : outcome.requiresReview ? "held_for_review" : "triaged",
    dedupe: {
      status: outcome.dedupe.status,
      rule: outcome.dedupe.rule,
      duplicateOf: outcome.dedupe.duplicateOf,
      revisionOf: outcome.dedupe.revisionOf,
    },
    triage: triage
      ? { outcome: triage.outcome, ruleId: triage.ruleId, ruleVersion: triage.ruleVersion, reasonCodes: triage.reasonCodes, requiresReview: triage.requiresReview }
      : null,
    requiresReview: outcome.kind === "accepted" ? outcome.requiresReview : false,
    // The signal is stored even when the investigation failed; it ran in a separate transaction.
    caseId: investigation?.caseId ?? null,
    investigation: investigation?.status ?? "skipped",
    // AI candidate facts (signal-extraction.v1); never used by triage, calculations or case rules.
    extraction: extraction?.status ?? "skipped",
  };
}

/** HTTP boundary for POST /api/signals. Documented in docs/signal-ingestion.md. */
export async function handleIngest(request: Request, deps: IngestDeps): Promise<Response> {
  if (!deps.apiKey) {
    logEvent("warn", "ingest.disabled");
    return errorResponse(503, "ingestion_disabled");
  }

  const presented = bearer(request);
  if (presented === null || !keysMatch(presented, deps.apiKey)) {
    const limited = deps.authFailureLimiter.check("unauthenticated");
    logEvent("warn", "ingest.unauthorized");
    if (!limited.allowed) {
      return errorResponse(429, "rate_limited", {}, { "retry-after": String(limited.retryAfterSeconds) });
    }
    return errorResponse(401, "unauthorized", {}, { "www-authenticate": "Bearer" });
  }

  const rate = deps.limiter.check(digest(presented).toString("hex"));
  if (!rate.allowed) {
    logEvent("warn", "ingest.rate_limited");
    return errorResponse(429, "rate_limited", {}, { "retry-after": String(rate.retryAfterSeconds) });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!/^application\/json(\s*;|$)/.test(contentType)) {
    return errorResponse(415, "unsupported_media_type");
  }

  const body = await readCapped(request, MAX_PAYLOAD_BYTES);
  if (body === null) {
    logEvent("warn", "ingest.payload_too_large");
    return errorResponse(413, "payload_too_large");
  }

  let store: Awaited<ReturnType<IngestDeps["getStore"]>>;
  try {
    store = await deps.getStore();
  } catch (error) {
    logEvent("error", "ingest.store_unavailable", { errorClass: error instanceof Error ? error.constructor.name : "unknown" });
    return errorResponse(503, "store_unavailable");
  }
  if (!store) return errorResponse(503, "ingestion_disabled");

  let outcome: ProcessOutcome;
  let investigation: InvestigationOutcome | null;
  let extraction: ExtractionRunOutcome | null;
  try {
    ({ outcome, investigation, extraction } = await ingestAndInvestigate(deps.tenantId, body, {
      repo: store.repo,
      caseIndex: store.caseIndex,
      clock: deps.clock,
      investigation: { ...store.investigation, clock: deps.clock },
    }));
  } catch (error) {
    // Stack traces, SQL and driver messages stay in the server; the caller only learns that nothing was stored.
    logEvent("error", "ingest.store_failed", {
      errorClass: error instanceof Error ? error.constructor.name : "unknown",
      sqlState: (error as { code?: string } | null)?.code ?? null,
    });
    return errorResponse(503, "store_unavailable");
  }

  logEvent("info", "ingest.processed", {
    signalId: outcome.signalId,
    correlationId: outcome.correlationId,
    kind: outcome.kind,
    investigation: investigation?.status ?? null,
    caseId: investigation?.caseId ?? null,
    extraction: extraction?.status ?? null,
  });

  if (outcome.kind === "rejected") {
    const invalidJson = outcome.issues.some((i) => i.code === "invalid_json");
    if (invalidJson) {
      return errorResponse(400, "invalid_json", { signalId: outcome.signalId, correlationId: outcome.correlationId });
    }
    return errorResponse(422, "validation_failed", {
      signalId: outcome.signalId,
      correlationId: outcome.correlationId,
      issues: outcome.issues,
    });
  }
  return json(outcome.kind === "duplicate" ? 200 : 201, successBody(outcome, investigation, extraction));
}
