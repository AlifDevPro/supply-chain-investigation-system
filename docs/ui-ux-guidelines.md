# UI/UX guidelines

Applies to every interface in this repository. Derived from `AGENTS.md` sections 6, 10, 11 and 12, and
`.cursor/rules/40-frontend-ux.mdc`. The `ui-ux-review` skill checks work against this file.

## 1. Principles

1. Evidence before conclusions. A figure or claim is shown with its verification state and its source.
2. Provisional is never styled like verified. A deficit that rests on unverified inputs says so next to the number.
3. A recommendation is not an authorization. AI- or rule-suggested actions are labelled "not approved", and
   controls that cannot work yet are disabled with a visible reason, not hidden and not clickable.
4. Missing data stays visible. "Not measured", "not provided", "No event recorded" and "none retrieved" are
   explicit strings. Never show 0, a dash or an empty cell for something unknown.
5. Real events only. Live Activity renders persisted events. No timers, fabricated progress or animation
   stands in for backend work. A stage is "reached" only if an event exists.
6. Synthetic data is labelled on every page (header badge and an in-page notice). Never invent statistics.
7. Status is never conveyed by colour alone: every status has an icon or glyph, a text label and, where it
   helps, a distinct border style.

## 2. Look and feel

- Light theme is primary; dark is an alternative (Light / Dark / System in the header).
- Warm neutral surfaces, charcoal text, subtle 1px borders, one restrained moss accent (`--primary`).
- Forbidden: navy/electric-blue dashboards, blue-purple gradients, neon, glass effects, decorative charts,
  decorative AI imagery, gratuitous animation.
- Elevation comes from borders. The only shadow is on overlays (popovers, menus).
- Tokens live in `src/app/globals.css` as semantic variables; components use semantic Tailwind names
  (`bg-card`, `text-muted-foreground`, `border-border-strong`, `text-status-stale`). Do not hardcode hex values
  in components. shadcn's `--accent` is a hover surface; brand moss is `--primary`.
- Contrast is tested against the real token values (`src/lib/design/contrast.test.ts`): 4.5:1 for text,
  3:1 for UI boundaries and focus rings, in both themes.

### Type and spacing

| Role | Font | Notes |
| --- | --- | --- |
| UI text | IBM Plex Sans | 13px dense (`text-dense`), 14px body, 16px section titles |
| Identifiers, timestamps, quantities | IBM Plex Mono | tabular numerals |
| Page titles only | Source Serif 4 | the single editorial element |

Scale 12 / 13 / 14 / 16 / 20 / 26 / 32. 4px spacing grid. Radii 4 / 6 / 8.

## 3. Status vocabulary

| Concept | States | Component |
| --- | --- | --- |
| Claim / evidence verification | verified, reported, inferred, assumed, unknown, conflicted, stale | `ClaimStateBadge` |
| Impact calculation | verified, provisional, incalculable, none | `ImpactStatusBadge` |
| Case lifecycle | received ... resolved, blocked | `CaseStateBadge` |
| Severity | critical, high, medium, low | `SeverityIndicator` (4-step glyph + label) |
| Event | completed, failed, retrying, waiting, skipped | `EventStatus` (icon + text) |
| Triage | irrelevant, relevant, uncertain, related_existing, high_impact | `TriageOutcomeBadge` |
| Stream connection | replay, connected, reconnecting, stale, disconnected | `ConnectionStatus` |

Do not collapse claim states into a single confidence score. Do not show a model's self-reported confidence
as a probability.

## 4. Required states on every data view

Loading (`loading.tsx`, skeleton without shimmer), empty (`EmptyState`, says what would populate it), error
(`ErrorState`, no internals), permission denied (`PermissionDeniedState`), stale (`StaleDataBanner` plus the
freshness indicator). With fixture data these are reachable with `?scenario=empty|error|denied|stale`.
With a store (`memory` / `database`) the scenario parameter is ignored; an unreachable store shows the
error state with a safe hint and never substitutes fixtures.

Error text must not leak stack traces, SQL, prompts or payloads. "Empty" describes the loaded view; it must
not claim a record does not exist in the underlying systems.

## 5. Layout

- Shell: collapsible left sidebar (Operate / Explore / Govern), 52px sticky header with breadcrumbs, data-mode
  badge, theme toggle and account menu. The account menu shows the signed-in name, role and Sign out.
  Unauthenticated visitors are redirected to `/login`. Export and settings edits stay disabled.
- Overview order: needs attention, key metrics (each with a qualifier, an as-of time and a click-to-open definition; no hover-only content), the
  investigations table, recent signals, stage distribution, recent important events.
- Live Activity: stage rail (counts from recorded events), then the event log with filters and a per-signal
  trace drawer. Unreached stages in a trace are hollow and read "No event recorded".
- Investigation workspace: header (identity, state, owner, review reason, provisional impact tile, next
  action, section links); main column answers what happened, claims, impact calculation, conflicts and
  unknowns, affected entities, proposed actions; right rail has Evidence | Timeline | Audit. Below 1024px the
  rail follows the main column. Evidence opens a drawer showing source system, record id, location, observed
  and source-reported times, record version, extraction method and verification status, with a minimal excerpt.
- Metrics must have a defined formula, source and window before they are shown (see `MetricCard`).
- Data provenance (Phase 2): every Overview panel states its source (persisted signals vs fixture cases and
  metrics) and the cases-as-of time. Live Activity connection state is "Recorded replay" for fixtures and
  "Persisted snapshot" (with load time) for a store. Neither is a live stream and the copy says so.
- Signal handling is shown with `ProcessingStatusBadge` (rejected, duplicate, triaged, held for review) and
  `RevisionBadge`; each carries an icon and text, never color alone. Recent signals has an All / Held for
  review filter (`aria-pressed`). Held signals are never hidden by default.
- "Submit synthetic signal" is a sheet on Live Activity, shown only when `ENABLE_SYNTHETIC_SUBMIT=true` and
  the source is not fixtures. It posts through a server action that uses the server tenant; the result
  (accepted, duplicate, rejected with issue paths) is shown inline.
- Review Queue: held signals without a case, plus cases in `needs_review` or `awaiting_approval`. Acknowledge /
  Request more evidence / Dismiss are enabled when the signed-in role may review; otherwise they stay
  visible and disabled with `aria-describedby` stating the reason.
- Evidence Explorer: latest-run evidence per case. Opening a row uses the existing provenance drawer.
- Supply Chain Graph: focused columns (Supplier → Purchase order → Material → Production order → Factory →
  Shipment) plus a relationship table. A focused view starts at one hop; Expand adds the next hop. Verified
  edges cite the foreign-key column. Selecting a node or edge opens a source sheet.
- Reports: metric cards with formula / source / window; bar lists with a text summary. Windows are `24h`,
  `7d` or all. Verified outcomes count stored `outcome.verified` events (none until a manager records one).
- Integrations: observed facts about the ingest API, the store and the AI provider. Planned connectors are
  listed as disabled. Cards never say "connected" or "healthy".
- Audit & Security: append-only events as the audit trail; RLS and mutation guards read from Postgres when
  configured. Export is disabled.
- Settings: read-only process configuration. `DATABASE_URL`, `INGEST_API_KEY` and `SESSION_SECRET` appear only as set or not set.

## 6. Accessibility

- Skip link to `#main-content`; one `h1` per page; landmarks for sidebar, header, main and rail.
- All controls are keyboard reachable with a visible 2px focus ring. Icon-only controls have accessible names.
- Tables use real `<table>` markup with `scope` headers and `aria-sort`.
- Drawers are dialogs (focus trap, Escape to close). Disabled actions use `aria-describedby` to point at the
  reason.
- Dynamic text (copy confirmation, pagination counts, held-event count) is announced politely.
- Respect `prefers-reduced-motion`. There are no looping animations.
- Automated axe checks run in component tests. jsdom cannot check colour contrast, so that is covered by the
  token contrast test.

## 7. Review checklist (used by `ui-ux-review`)

- Is status, impact, owner and next action visible without scrolling on a case?
- Does each material number show its verification state and a path to its evidence?
- Are conflicts and unknowns shown as prominently as findings?
- Is freshness shown, and does stale data change the presentation?
- Could an unapproved suggestion be mistaken for an approved action?
- Is any metric, chart or progress indicator unsupported by real data?
- Are any buttons non-functional without a stated reason?
- Do all four non-happy states exist for the view?
- Keyboard, labels, focus, contrast, narrow widths (375 / 768 / 1024 / 1440), both themes.
- Are shadcn/ui components reused instead of duplicated?
