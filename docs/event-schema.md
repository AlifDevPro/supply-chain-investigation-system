# Investigation event schema (Phase 1 contract, extended in Phases 2, 3 and 4)

Source of truth: `src/lib/domain/events.ts` (zod schema `investigationEventSchema`).
Live Activity renders these records. With `DATA_SOURCE=fixtures` (default) they come from a recorded
synthetic fixture (`src/fixtures/dataset.ts`) and the UI says "Replaying recorded synthetic events".
With `DATA_SOURCE=memory` or `database` (Phase 2) they are persisted by the ingestion pipeline and the UI
says "Persisted snapshot": events read from the store when the page loaded, not a live stream. When SSE is
introduced the components keep the same contract.

Persisted events are append-only: database triggers reject `update` and `delete` on `signal_events`.

## Fields

- `id`: unique event identifier. Consumers ignore a second delivery of the same `id`.
- `sequence`: monotonic integer. In the database it is a global identity column (so it is monotonic for a
  tenant but not gapless). Ordering is `occurredAt`, then `sequence`.
- `tenantId`: tenant scope. Every consumer query and stream is tenant-scoped.
- `caseId`: investigation, when one exists. `null` before a case is created.
- `signalId`: originating signal, when the event belongs to one.
- `correlationId`: joins every event of one signal or action. Used for the signal trace.
- `type`: one of the conventional names in `eventTypeSchema` (`signal.received`, `triage.completed`, ...).
- `stage`: one of `received, validated, deduplicated, triaged, evidence, impact, case, extraction, review, action, verified, integration`.
- `status`: `completed | failed | retrying | waiting | skipped`.
- `occurredAt`: server-generated ISO timestamp. Clients never set it.
- `durationMs`: measured duration, or `null`. `null` is displayed as "not measured", never invented.
- `method`: `{kind: rule | model | system, name}` when it is safe and useful to show.
- `retryCount`: number of retries so far.
- `errorClass`: classified error (`validation_error`, `source_unavailable`, `timeout`,
  `authorization_denied`, `internal_error`). No stack traces.
- `metadata`: flat, safe key/value pairs (string up to 120 chars, number or boolean). No secrets, no message
  bodies, no source payloads.
- `dataMode`: `"synthetic"` (enforced by a database check constraint in Phase 2).

## Semantics

- A stage is "reached" only if an event for it exists. Stages without events are shown as "No event recorded".
- Per signal, the stage summary uses the latest event for each (correlation, stage) pair.
- `waiting` at the `review` stage means a human decision is pending. It is not an error.
- `action.execution_completed` does not imply the business outcome happened; only `outcome.verified` does.
- A duplicate signal ends after `signal.deduplicated` with `metadata.duplicate = true`.
- `signal.held_for_review` (Phase 2, stage `review`, status `waiting`) is emitted when triage requires a
  human to look at the signal (uncertain, high impact, related to an open case, or a revision). It does not
  mean a review has happened; `review.completed` (Phase 5) does.
- A rejected submission records `signal.received` and a `failed` `signal.validated` with
  `errorClass = validation_error`. The rejected payload is not stored, only issue paths and codes.
- Phase 2 event types written by the pipeline: `signal.received`, `signal.validated`,
  `signal.deduplicated`, `triage.completed`, `signal.held_for_review`. Durations are measured with a
  monotonic clock; `signal.received` has `durationMs = null` because nothing is measured before ingest.
- Event `metadata` is capped at 2048 bytes and must be a JSON object (database check).

### Phase 3 investigation events

Written by `src/lib/investigation/run.ts` in the same transaction as the case, signal link and run. They carry
the `caseId`, the triggering `signalId` (null for an operator re-run) and that signal's `correlationId` (a
re-run uses the newest linked signal's), so the signal trace continues into the case. Every event has
`metadata.actor`: `system` for automatic runs, or the signed-in user's display name for operator, review
and approval events.
`signal_events.case_id` has a composite foreign key to `cases (tenant_id, id)`.

| Type | Stage | Status | Metadata (counts and codes only) |
| --- | --- | --- | --- |
| `evidence.retrieved` | `evidence` | `completed` | `calls`, `rows`, `truncated`, `budgetExhausted`, `evidence`, `notFound` |
| `evidence.retrieved` | `evidence` | `failed` | `stored: true`; `errorClass` = `source_unavailable` (connection errors) or `internal_error`. No case is created; the signal stays stored. |
| `impact.calculated` | `impact` | `completed` or `skipped` | `shortageStatus`, `deficit`, `unit`, `deliveryRiskStatus`, `delayDays`, `affectedOrders` |
| `investigation.created` / `investigation.updated` | `case` | `completed` | `runId`, `runNumber`, `trigger`, `state`, `severity`, `claims`, `conflicts`, `unknowns` |
| `investigation.needs_review` | `review` | `waiting` | `reason` (clipped to 120 chars) |

`durationMs` is measured for retrieval and for analysis; the case events have `null`. `needs_review` means
a review is requested, not that it happened.

### Phase 4 extraction events

Written by `src/lib/investigation/extraction.ts` in the same transaction as the `ai_extractions` row (see
`docs/ai-extraction.md`). Stage `extraction` ("AI extraction") sits after `case`, so a failed extraction
never marks evidence or the case as failed. The event carries the signal's `correlationId` and its `caseId`
when the signal is linked to one. `method` is `{ kind: "model", name: "<provider>:<model>" }` (the mock is
`mock:mock-extractor-1`, which is not a model); `retryCount` is attempts minus one; `durationMs` is the
measured total latency across attempts.

| Type | Status | `errorClass` | Metadata (counts and codes only) |
| --- | --- | --- | --- |
| `extraction.completed` | `completed` | none | `actor`, `provider`, `model`, `promptVersion`, `fields`, `rejected`, `disagreements`, `attempts`, optional `inputTokens`, `outputTokens` |
| `extraction.failed` | `failed` | `validation_error` (invalid output), `source_unavailable` (provider unreachable or erroring), `timeout` | the same keys plus `failure` (a code such as `unparseable_json`, `unreachable`, `http_500`, `timeout`) |

No prompt, model response, quote or extracted value is put in event metadata. Signals that are not eligible
(rejected, duplicate, irrelevant, no text) and runs with `AI_PROVIDER=none` write no extraction event, so
the trace shows "No event recorded" for the stage.

### Phase 5 review and action events

Written after a signed-in review or approval. `metadata.actor` is the signed-in display name.

| Type | Stage | Status | Metadata |
| --- | --- | --- | --- |
| `review.completed` | `review` | `completed` | `actor`, `actorUserId`, `decision` |
| `action.approved` | `review` | `completed` | `actor`, `actionId`, `version`, `digest`, `role` |
| `action.execution_started` / `action.execution_completed` | `action` | `completed` | `actor`, `actionId`, `adapter: synthetic.v1`, `sent: false` |
| `outcome.verified` | `verified` | `completed` | `actor`, `matched: true` |

`action.execution_completed` is not `outcome.verified`. See `docs/review-and-actions.md`.

### Phase 6 MCP and connector events

Written by the MCP tool host and HTTPS connector pollers. `signalId` and `caseId` are usually null.
Stage is always `integration`. See `docs/mcp-and-integrations.md`.

| Type | Status | Metadata (safe only) |
| --- | --- | --- |
| `tool.called` | `completed` | `tool`, `actorKind`, `callId` |
| `tool.completed` | `completed` | `tool`, `callId`, `rows`, `truncated` |
| `tool.failed` | `failed` | `tool`, `callId`, `reason` (+ `errorClass`) |
| `connector.poll_started` | `completed` | `connector`, `runId`, `configured` |
| `connector.poll_completed` | `completed` | `connector`, `runId`, `signalsIngested`, optional `httpStatusClass` |
| `connector.poll_failed` | `failed` | `connector`, `runId`, `signalsIngested`, optional `httpStatusClass` (+ `errorClass`) |

Append-only tables `tool_calls` and `connector_runs` mirror these for the Integrations activity feed.
Secrets and full source payloads are never stored in metadata.

## Consumer rules (UI)

- Dedupe by `id`; sort by `occurredAt` then `sequence`.
- Show connection state (connected, reconnecting, stale, disconnected) separately from event status.
- Handle permission errors and unavailable data with explicit states, not empty tables.
- Limitation: there is no live stream yet. Connection state is "Recorded replay" (fixtures) or
  "Persisted snapshot" (store); reload to see new events.
