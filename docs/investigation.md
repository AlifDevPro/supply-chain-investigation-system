# Evidence, impact and investigation persistence (Phase 3)

Phase 3 turns a stored signal into a persisted investigation case: it retrieves authorized business records,
records evidence with provenance, derives claims, conflicts and unknowns, runs deterministic impact
calculations, and stores the result as an immutable run. **No AI model is involved** (Phase 4).
`propose-actions.v1` may attach rule-suggested actions after a run. Approvals, synthetic execution and
outcome verification are documented in `docs/review-and-actions.md`. Everything here runs on SYNTHETIC data.

Code: `src/lib/investigation/` (rules and orchestration), `src/lib/impact/` (calculations),
`src/lib/store/` (persistence). Schema: `supabase/migrations/0002_business_records.sql`,
`0003_investigations.sql`.

## Data model

**Business records (0002)**: `suppliers`, `materials` (with `variant` and `base_unit`), `locations`
(factory or warehouse), `purchase_orders`, `purchase_order_lines` (quantity, unit, promised date,
destination), `production_orders`, `production_requirements`, `inventory_balances` (lot, on hand, quality
status, counted at), `inventory_reservations`, `shipments` (status, ETA). Every row has `tenant_id`, a
composite primary key that starts with it, composite foreign keys (a row can only reference rows of the same
tenant), `record_version`, `updated_at` and `data_mode = 'synthetic'`. The application only **reads** them
through `BusinessRecordReader`; only `npm run db:seed` writes them.

**Investigations (0003)**:

| Table | Mutability | Purpose |
| --- | --- | --- |
| `cases` | current state is updated; delete/truncate rejected | Title, summary, state, severity, owner role, next action, review reason, origin (`automatic` / `operator`), `reference_keys`, `latest_run_id` |
| `case_signals` | insert only in practice; delete/truncate rejected | Links a signal to one case (`origin`, `related_reference`, `operator_opened`). A signal belongs to at most one case (unique index). |
| `investigation_runs` | append-only (update/delete/truncate rejected) | Trigger, rule versions, retrieval accounting, entity graph, timestamps |
| `evidence_items`, `claims`, `unknowns`, `conflicts`, `impact_calculations` | append-only | Findings of one run. Re-running never rewrites an earlier run. |

All tables have row-level security enabled with no policies, and privileges revoked from `anon` and
`authenticated`, so Supabase's public API cannot read them. The server connects with the database role in
`DATABASE_URL`, and every query names the tenant.

## Retrieval (`BusinessRecordReader`, `retrieve.ts`)

References come from the case's linked signals (newest value per key wins). Order:

1. Shipment reference (may supply the purchase order).
2. Purchase order and its lines; the focal line is the one for the referenced material, or the only line.
3. Shipments for that purchase order.
4. Inventory balances for a referenced lot.
5. Material: from the reference, else the focal line, else a single lot row. Location: from the line, else
   the lot, else the only inventory location.
6. Material master and inventory balances for the material.
7. Reservations at the location.
8. Open production requirements for the material from 14 days ago to 60 days ahead, filtered to the location.

Bounds: at most **12 reader calls** per run (`RETRIEVAL_CALL_BUDGET`) and **20 rows** per call. When the
budget runs out the remaining steps are skipped and recorded as an unknown ("retrieval stopped early"); the
run's `retrieval` shows `budgetExhausted`. Row truncation sets `truncated`. Reader errors are never turned
into empty results: they fail the run (see Failures).

"Not found" always means **not found in the synthetic records searched for this tenant**, never "does not
exist".

## Evidence and claims: `investigation.v1`

Evidence items are a reference plus a minimal excerpt (max 600 characters), with `sourceSystem`,
`sourceTable`, `sourceRecordId` (for lines `PO-77410/1`), `recordVersion` (`v<record_version>`),
`extractionMethod` and `verificationStatus`.

- **Signals** (up to 5, newest first): `sourceTable = signals`, status `reported`. A supplier message is
  evidence of what the supplier said, not proof that it happened. Instructions inside signal text are data.
- **System records**: purchase-order lines, shipments, inventory, reservations, requirements are `verified`
  (they are the system of record) unless stale. Material master evidence uses source type `material_master`.
- **Inventory freshness**: a count older than 24 hours is `stale` and adds an unknown.

Conflicts (each with at least two evidence-backed sides; otherwise recorded as an unknown):

- Linked signals report different delay lengths (`delay-length.v1` extracts "four days", "2 weeks", ...).
- The reported delay disagrees with the shipment ETA.
- A delay is reported for a purchase order that is received or cancelled, or for a delivered shipment.
- The reported material is not on the purchase order; the reported quantity differs from the ordered
  quantity (after unit conversion) or uses an incompatible unit.
- A failed quality inspection is reported for a lot that inventory shows as released.

Unknowns: purchase order, shipment or material not found; no shipment record; quality status `unknown`;
stale inventory; no open requirement in the window; retrieval stopped early.

## Impact calculations (deterministic)

**Shortage: `shortage.v1`** (`src/lib/impact/shortage.ts`, unchanged from Phase 1).
Required = open requirements at the location due before the expected arrival (or within 14 days when there
is no arrival date). Usable = on hand excluding quality holds, minus reservations for **other** orders.
Quantities are converted to the material's base unit. The result is `verified` only when every input is
verified; otherwise `provisional`, with each missing or assumed input listed. If no reservation rows are
found, reserved = 0 is recorded as **inferred**, not verified.

**Delivery risk: `delivery-risk.v1`** (`src/lib/impact/delivery-risk.ts`). Expected arrival = shipment ETA,
else promised date + reported delay, else the promised date (assumed). Dates are UTC calendar days.
`delayDays` = arrival - promised; `slackDays` = earliest requirement - arrival (negative = arrives after it
is needed); affected orders are requirements due strictly before arrival. `verified` only with a verified
promised date, an ETA as the basis and no conflicts. Without a promised date or arrival it is
`incalculable`.

### README example (seeded as `MSG-2101`)

8,000 m of navy twill (PO-77410, NV-4410) reported four days late. The line promises it in 2 days, so the
expected arrival is in 6 days (basis: reported delay, no shipment record). PRD-5106 needs 6,000 m in 5 days.
Inventory: 500 m with quality status `unknown`; 200 m reserved for PRD-5107. Result: **provisional shortage
5,700 m** (6,000 - (500 - 200)); the shortage lists the unknown quality-release status and the delivery
risk lists the missing "Shipment record with a confirmed ETA". It is
never shown as a confirmed 5,500 m or 5,700 m shortage.

## Case rules: `case-rules.v1`

| Signal | Decision |
| --- | --- |
| rejected, duplicate, irrelevant, untriaged | skip (no case) |
| shares a purchase order, shipment or lot with an open case | attach (`related_reference`) |
| shares only a material or production order with an open case, and no conflicting purchase order/shipment/lot | attach |
| `high_impact`, `relevant`, `related_existing` (no persisted match) | create (`origin`) |
| `uncertain` | **hold** until an operator clicks "Open investigation" |

Open states: everything except resolved, rejected, dismissed, failed and cancelled. The decision is made
before retrieval and **re-checked inside the write transaction** under a per-tenant advisory lock; if another
run created or changed the case in between, the attempt is repeated (at most 3 times).

Case fields are derived, never typed by hand: title from the oldest linked signal; state `needs_review` when
triage required review, an impact is not verified, or any conflict or unknown exists (otherwise
`investigating`); severity `critical` (deficit and late), `high` (high-impact signal, any deficit or affected
order), `medium` (delay reported or relevant), else `low`; next action from the first conflict, else the first
unknown's suggested retrieval. Owner is "Unassigned"; the owner role follows the source type.

## Runs, triggers and failures

Each analysis appends run `INV-xxxx-R<n>` with trigger `signal`, `related_signal`, `operator_open`,
`operator_rerun` or `backfill`, the rule versions used, retrieval accounting and up to 10 linked signals.

Ingestion stores the signal first (its own transaction). The investigation runs **afterwards** in a separate
transaction. If retrieval fails, nothing is written except a failed `evidence.retrieved` event
(`source_unavailable` for connection errors, otherwise `internal_error`); the API returns
`investigation: "failed"` with the stored `signalId`. Events are described in `docs/event-schema.md`.

## Operator actions

`ENABLE_OPERATOR_ACTIONS=true` shows **Open investigation** (signal trace of a held signal) and **Re-run
investigation** (case page). The server actions re-check the flag, validate the id format, apply a rate
limit (10/minute per server), always use the server tenant, and require a signed-in session. The actor
on new events is the signed-in display name. No supplier, inventory or schedule record is changed by
open or re-run.

## Commands

```bash
npm run db:migrate                     # applies 0002 and 0003
npm run db:seed                        # business records (idempotent) + any missing seed signals
npm run db:seed -- --refresh-records   # move dates relative to today; bumps record_version
npm run db:investigate -- --backfill   # investigate stored signals without a case, oldest first
```

## Limitations

- Business records are synthetic and only change through the seed script; there is no source integration.
- Retrieval uses fixed rules; it does not search for alternative suppliers or other purchase orders that
  could cover a shortage.
- One location per investigation (the purchase-order destination or the lot's location).
- No recalculation is triggered when business records change; use Re-run or the backfill.
- Operator open/re-run still requires `ENABLE_OPERATOR_ACTIONS` and a signed-in session.
- Pages show a snapshot at load time; there is no live push.
