# Review, approvals and verified outcomes

Phase 5 adds signed-in review decisions, versioned proposed actions, a synthetic executor and an
independent outcome check. SYNTHETIC DATA ONLY. Nothing here sends supplier mail or writes ERP rows.

See also [ADR 0003](adr/0003-signed-session-auth.md).

## State machine (`transitions.v1`)

Allowed edges. Invalid transitions throw and never write a success-shaped event.

| From | To |
| --- | --- |
| `needs_review` | `awaiting_approval`, `resolved`, `dismissed`, `blocked`, `rejected` |
| `awaiting_approval` | `approved`, `needs_review`, `rejected` |
| `approved` | `executing` |
| `executing` | `awaiting_verification`, `failed` |
| `awaiting_verification` | `resolved`, `blocked` |

`action.execution_completed` moves a case to `awaiting_verification`, never `resolved`.

Review decisions are checked against that table before the row is inserted. From `needs_review`:
acknowledge → `resolved`, request more evidence → `blocked`, dismiss → `dismissed`, reject → `rejected`.
From `awaiting_approval`: request more evidence → `needs_review`, reject → `rejected`. Acknowledge and
dismiss are refused and write no row. A held signal with acknowledge, dismiss or reject leaves the queue;
request more evidence keeps it there.

## Proposed actions (`propose-actions.v1`)

From the **latest run only**. Origin is always `rule_suggested`. AI extraction cannot originate an
approvable action.

- A conflict about supplier dates → “Ask supplier to confirm revised ship date” (`requiredRole: procurement`).
- An unknown about quality release or reservations → “Retrieve quality-release / reservation records”
  (`requiredRole: reviewer`).

Parameters are concrete ids already on the case. A parameter change increments `version` and computes a
new `parameter_digest`. A previous approval of an older version cannot be reused.

## Approval

Requires a session whose role contains the action’s `requiredRole`, plus the exact `actionId`, `version`
and digest. Stale version or digest → reject, no state change.

Roles (server-enforced):

- `reviewer` — review decisions; may accept reviewer-only retrieval actions.
- `procurement` — review plus procurement-required actions.
- `manager` — review, any approval, and `outcome.verified`.

## Synthetic executor (`synthetic.v1`)

Writes `action.execution_started` then `action.execution_completed` with
`{ adapter: "synthetic.v1", sent: false, reason: "no connector" }`. Idempotent on
`(tenant, action_id, version)`. Does not call SMTP, HTTP, or `UPDATE` business tables.

## Outcome verification (`verify-outcome.v1`)

Re-reads authorized records and compares them to a fingerprint stored at execution time.

- Unchanged records → observation “not verified: source records unchanged”; case stays
  `awaiting_verification`.
- Only a manager may record `outcome.verified`, and only when the checker reports a matching change
  (for example after `npm run db:seed -- --refresh-records` bumps versions).

Execution completed is not a verified outcome.
