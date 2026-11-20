# Reports and metrics (Phase 7)

Source of truth for formulas: `src/lib/derive/reports.ts` (`computeReportMetrics`).
UI: `/reports` with windows `24h`, `7d`, and `all`.

All figures are computed from **stored** signals, events, cases and extractions. Rates and averages
are `null` (“not measured”) when the denominator is zero. Nothing invents operational ERP performance.
Demo / synthetic data is always labelled as such in the Reports source line.

## Windows

| Window | Meaning |
| --- | --- |
| `24h` | Records with timestamp ≥ page-load time − 24 hours |
| `7d` | Records with timestamp ≥ page-load time − 7 days |
| `all` | No rolling cutoff |

**Windowed fields** use `receivedAt` (signals), `occurredAt` (events), `createdAt` (extractions), or
`openedAt` (investigation throughput). **Current backlog / current cases** ignore the rolling window.

## Metrics

| Metric | Kind | Formula | Window | Source |
| --- | --- | --- | --- | --- |
| Signals in window | count | Count of stored signals | windowed (`receivedAt`) | `signals` |
| Duplicate rate | rate | duplicates ÷ accepted (excludes rejected) | windowed | `signals.processingStatus` |
| Held for review | count + age | Current `held_for_review` signals; age = hours since `receivedAt` | current backlog | `signals` |
| Median measured latency | median ms | Median of `event.durationMs` where not null | windowed | `signal_events` |
| Investigations opened | count | Cases with `openedAt` in window | windowed | `cases.opened_at` |
| Volume by source type | counts | Signals grouped by `sourceType` | windowed | `signals` |
| Triage mix | counts | Signals with a triage outcome | windowed | `signals.triageOutcome` |
| Event failures by class | counts | Failed events grouped by `errorClass` | windowed | `signal_events` |
| AI extraction status | counts | Extractions by `status` | windowed | `ai_extractions` |
| Verified / provisional / … impact | counts | Current cases by `impactStatus` | current cases | case latest run |
| Unknowns / conflicts per case | average | Sum of latest-run unknowns (or conflicts) ÷ case count | current cases | investigation runs |
| Rules agreement | rate | Compared AI fields with result `agrees` ÷ all compared fields | windowed | `ai_extractions.comparison` |
| Cases by lifecycle state | counts | Current cases by `state` | current cases | `cases` |
| Verified outcomes | count | Events with type `outcome.verified` | windowed | `signal_events` |
| Verification rate | rate | `outcome.verified` ÷ `action.execution_completed` in window | windowed | `signal_events` |

### Deferred (not Phase 7)

- Time to detection / time to resolution (needs agreed lifecycle timestamps).
- Shortage trend series and chart libraries.
- Authorized export of report CSVs.

## Source label

`reportDataSourceLabel(mode)`:

- fixtures → synthetic fixture wording
- memory → synthetic data in server memory
- database → synthetic data in Supabase Postgres

Always ends with “Not operational data.”
