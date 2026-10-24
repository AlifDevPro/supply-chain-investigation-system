# Signal ingestion, deduplication and triage (Phase 2, linked to investigations in Phase 3)

Source of truth for the rules is code under `src/lib/ingestion/` and `src/lib/domain/signal-input.ts`.
This document explains the behavior, the HTTP contract and the limits. All data is **synthetic**
(`dataMode: "synthetic"`); a payload with any other `dataMode` is rejected.

## Pipeline

`processSignal()` is the only path from raw text to stored outcome. The HTTP route and the synthetic-submit
server action both call it.

1. **Receive.** Record `signal.received`. The server assigns the signal id, correlation id and all timestamps.
2. **Validate and normalize** (`signal.validated`). Parse JSON, validate with a strict schema, normalize.
   Normalization is reported inside this stage; it is not a separate stage.
3. **Deduplicate** (`signal.deduplicated`) using rules `dedupe.v1`.
4. **Triage** (`triage.completed`) using ordered deterministic rules `triage.v1`. Skipped for exact duplicates.
5. **Hold for review** (`signal.held_for_review`, stage `review`, status `waiting`) when triage requires a human.

The signal row and all of its events are written in **one database transaction**. If persistence fails
nothing is stored and the caller gets an error (never a success-shaped response).

No AI model is used in this phase. Evidence retrieval, impact calculation and case creation are Phase 3.
Triage output is therefore a classification, **not** a conclusion that anything happened.

## Input schema

Strict: unknown keys are rejected. Message text is data and is never executed or obeyed.

| Field | Rules |
| --- | --- |
| `sourceType` | one of `supplier_email, erp_purchase_order, inventory_balance, inventory_reservation, production_order, shipment, quality_record, manual_report` |
| `sourceSystem` | 1-80 chars |
| `sourceRecordId` | optional, 1-120 chars. Enables record-based deduplication |
| `sourceReportedAt` | optional ISO 8601 timestamp with offset |
| `label` | 1-200 chars |
| `excerpt` | optional, up to 600 chars (a minimal excerpt, not a full message) |
| `references` | optional object: `purchaseOrder, material, shipment, lot, productionOrder` (each up to 64 chars) |
| `quantity` | optional `{ value, unit }`. `value` finite and >= 0. `unit` one of `m, yd, kg, pcs` or a known synonym (`meter(s)`, `metre(s)`, `yard(s)`, `kilogram(s)`, `kgs`, `piece(s)`, `pc`, `units`...) |
| `attributes` | optional: `inspectionResult` (`passed, failed, unknown`), `routineSync` (bool), `varianceDetected` (bool) |
| `dataMode` | must be `"synthetic"` |

Total payload is limited to **16 KB** (16384 bytes).

### Normalization

- Strings trimmed, Unicode NFC, internal whitespace collapsed.
- Identifiers (`sourceRecordId`, reference values) upper-cased.
- Timestamps converted to UTC ISO 8601.
- Units mapped to `m | yd | kg | pcs`. **No unit conversion** is performed in this phase.
- Missing optional fields stay `null`. Nothing is invented or defaulted.
- The raw submitted JSON is stored separately from the normalized record and is never rewritten.

## Deduplication: `dedupe.v1`

Two hashes are computed from the normalized record:

- `contentHash`: sha256 of the full canonical normalized record.
- `fingerprint`: sha256 of source type, source system, sorted references, quantity and the lower-cased label.
  It deliberately excludes the excerpt and timestamps.

Rules, evaluated in order, always within one tenant:

1. **Exact duplicate by record.** Same source system, same `sourceRecordId` and same `contentHash` as an
   earlier canonical signal. Stored as a new row linked by `duplicateOf`; not triaged. The event
   `signal.deduplicated` carries `duplicate = true`.
2. **Revision.** Same source system and `sourceRecordId` but a different `contentHash`. It is **not** a
   duplicate. It is stored as a new signal with `revisionOf` pointing at the latest earlier version, is
   triaged, and is always held for review because the source changed its report.
3. **Exact duplicate by fingerprint.** No `sourceRecordId`, same `fingerprint` and the earlier signal was
   received within the **24 hour** window. Linked by `duplicateOf`; not triaged. Outside the window it is a
   new signal.
4. **Not merged.** Signals that merely look similar (for example the same purchase order and material but a
   different fingerprint) are kept separate. The earlier ids are recorded as `possiblyRelated` hints (max 5)
   and add the reason code `possibly_related_signal`. They never cause a merge or a discard.

Concurrency: identical concurrent submissions are serialized by a transaction-scoped advisory lock on the
dedupe key, so exactly one becomes canonical. A partial unique index on
`(tenant, source system, record id, content hash)` for canonical rows is the backstop.

Duplicates are **kept** (as rows linked to the original) so the history of what was received stays auditable.

## Triage: `triage.v1`

Ordered, first match wins. Pure function of the normalized signal, the dedupe result and a case-reference
index. Output: `outcome`, `ruleId`, `ruleVersion`, `reasonCodes`, `requiresReview`, `relatedCaseIds`.
Stored rule ids carry the version prefix, for example `triage.v1/high-impact.quality-failed`; dedupe rule ids
look like `dedupe.v1/exact-record`. The table below omits the prefix.

| # | Rule id | Condition | Outcome | Review |
| --- | --- | --- | --- | --- |
| 1 | `high-impact.quality-failed` | `quality_record` with `attributes.inspectionResult = failed` | `high_impact` | yes |
| 2 | `high-impact.large-quantity` | supplier/shipment/PO/manual signal with disruption language and quantity at or above the unit threshold (`m` 5000, `yd` 5000, `kg` 2000, `pcs` 10000) | `high_impact` | yes |
| 3 | `related.open-case-reference` | any reference equals a reference of an **open** case | `related_existing` | no |
| 4 | `irrelevant.routine-sync` | `inventory_balance`, `routineSync = true` and `varianceDetected = false` | `irrelevant` | no |
| 5 | `relevant.delay-with-po` | unhedged delay/disruption language and a purchase-order reference | `relevant` | no |
| 6 | `uncertain.default` | nothing above matched | `uncertain` | yes |

Safety properties:

- `irrelevant` is produced **only** by a positive match (rule 4). There is no "looks unimportant" path, so
  nothing is discarded by default. Uncertain input stays visible.
- Hedged language ("possible", "may", "might", "unconfirmed", "schedule change") prevents rule 5 and falls
  to `uncertain`.
- A revision always sets `requiresReview = true` and adds `revision_of_earlier_signal`.
- Conflicting attributes (`routineSync` with `varianceDetected`) add `conflicting_attributes` and fall to `uncertain`.
- A purchase-order **reference** is not verification that the purchase order exists. The investigation
  (Phase 3, `docs/investigation.md`) looks it up and reports "not found in the searched records" when absent.
- Rule 3 compares against the **persisted open cases** of the tenant in `memory` and `database` modes (the
  fixture index is only used by unit tests). The open-case list is read once before the signal transaction;
  the case decision itself is re-checked under a lock when the investigation runs.

Reason codes: `quality_inspection_failed`, `quantity_over_threshold`, `matches_open_case_reference`,
`routine_inventory_sync`, `delay_language_with_po`, `no_rule_matched`, `no_disruption_language`,
`hedged_language`, `no_purchase_order_reference`, `missing_quantity`, `conflicting_attributes`,
`revision_of_earlier_signal`, `possibly_related_signal`.

## HTTP API: `POST /api/signals`

Request: `Authorization: Bearer <INGEST_API_KEY>`, `Content-Type: application/json`, body up to 16 KB.
The key maps to one tenant on the server; the client cannot choose a tenant. No tenant or role field in the
body is read.

| Status | `error.code` | Meaning |
| --- | --- | --- |
| 201 | n/a | New signal accepted and stored |
| 200 | n/a | Exact duplicate; stored and linked, `duplicateOf` returned |
| 400 | `invalid_json` | Body is not valid JSON (stored as a rejected signal) |
| 401 | `unauthorized` | Missing or wrong key |
| 413 | `payload_too_large` | Body exceeds 16 KB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `validation_failed` | Schema violation. `issues` lists field paths and codes, never values (stored as a rejected signal) |
| 429 | `rate_limited` | Per-key limit (30 requests / minute). `Retry-After` header set |
| 503 | `ingestion_disabled` | `INGEST_API_KEY` not configured, or `DATA_SOURCE=fixtures` |
| 503 | `store_unavailable` | Database unreachable or write failed. Nothing was stored |

Errors never contain stack traces, SQL, secrets or submitted values.

Successful body: `{ signalId, correlationId, status, dedupe: { status, rule, duplicateOf, revisionOf },
triage: { outcome, ruleId, ruleVersion, reasonCodes, requiresReview } | null, requiresReview, caseId,
investigation, extraction }`.

`investigation` (Phase 3) is `created | updated | held | skipped | failed`; `caseId` is the case the signal
was linked to, or `null`. The investigation runs in a **separate transaction after the signal commits**, so
`failed` still returns 201/200: the signal is stored and a failed `evidence.retrieved` event records the error
class (`source_unavailable` or `internal_error`). Duplicates are always `skipped`.

`extraction` (Phase 4, `docs/ai-extraction.md`) is `completed | invalid_output | unavailable | timeout |
disabled | skipped | failed`. It runs after the investigation and never changes the response status: the
signal and case are already committed. `disabled` means `AI_PROVIDER=none`; `skipped` means the signal is
not eligible (duplicate, irrelevant, no text); `failed` means the result could not be stored. With a provider
configured, the request can take up to `AI_TIMEOUT_MS × (1 + AI_MAX_RETRIES)` longer.

Requests rejected before the pipeline (401, 413, 415, 429, 503) are **not stored**; they are written to the
structured server log without payload content.

## Rejected submissions

A body that fails JSON parsing or schema validation (400 / 422) is stored as a signal with status
`rejected` so it stays visible in Live Activity. **The payload is not stored.** The row keeps only the
validation issue paths and codes, the payload size in bytes and its sha256. The event pair is
`signal.received` and a failed `signal.validated` with `errorClass = validation_error`.

## Data sources (`DATA_SOURCE`)

| Value | Behavior |
| --- | --- |
| `fixtures` (default) | Phase 1 recorded replay. Ingestion is disabled (`503 ingestion_disabled`). `?scenario=` works. |
| `memory` | Explicit development mode. Seeded, labelled synthetic signals live in server memory and reset on restart. Refused when `NODE_ENV=production`. |
| `database` | Supabase Postgres via `DATABASE_URL`. |

In `memory` and `database` modes `?scenario=` is ignored. If the store is unreachable the pages show an
explicit error state; they never fall back to fixtures. Cases and Overview metrics are read from the same
store (Phase 3); fixture cases such as INV-2041 are not shown in these modes.

## Limits and known limitations

- The rate limiter is in memory per server process. It is not a distributed limit.
- There is no user authentication; one shared ingest key serves one demo tenant.
- There is no live push of events to browsers. Pages show a persisted snapshot at load time.
- Pre-pipeline rejections (401, 413, 415, 429, 503) are not persisted.
- Durations are measured with a monotonic clock and can legitimately be 0 ms for in-process steps.
