# Supply Chain Investigation Platform

**Evidence-driven supply-chain intelligence for garment manufacturing.**

An AI-assisted investigation platform that helps garment factories detect supply-chain disruptions, connect fragmented operational evidence, calculate potential business impact, and coordinate verified resolutions through human-supervised workflows.

> **Development status:** Initial development and architecture phase. Features, integrations, metrics, and operational capabilities must be considered implemented only after they have been built and verified.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision](#3-product-vision)
4. [Core Features](#4-core-features)
5. [Primary Users](#5-primary-users)
6. [Example Investigation](#6-example-investigation)
7. [System Architecture](#7-system-architecture)
8. [Investigation Lifecycle](#8-investigation-lifecycle)
9. [AI and Hybrid Intelligence](#9-ai-and-hybrid-intelligence)
10. [MCP and Tool Integration](#10-mcp-and-tool-integration)
11. [UI/UX and Visualization](#11-uiux-and-visualization)
12. [Technology Stack](#12-technology-stack)
13. [Repository Structure](#13-repository-structure)
14. [Development Setup](#14-development-setup)
15. [Environment Configuration](#15-environment-configuration)
16. [Development Workflow](#16-development-workflow)
17. [Testing and Quality Assurance](#17-testing-and-quality-assurance)
18. [Security and Privacy](#18-security-and-privacy)
19. [Observability and Metrics](#19-observability-and-metrics)
20. [Implementation Roadmap](#20-implementation-roadmap)
21. [Definition of Done](#21-definition-of-done)
22. [Current Limitations](#22-current-limitations)
23. [Contributing and Engineering Rules](#23-contributing-and-engineering-rules)

---

## 1. Overview

Garment manufacturing supply chains involve suppliers, raw materials, purchase orders, inventory, production schedules, quality inspections, warehouses, logistics providers, and customer delivery commitments.

Important information is often distributed across emails, spreadsheets, ERP systems, inventory databases, shipping documents, and conversations between operational teams.

A disruption in one part of the supply chain can affect multiple downstream operations. Understanding the actual impact requires more than searching for a keyword or asking an LLM to summarize a message.

The Supply Chain Investigation Platform is designed to connect these fragmented signals and help operational teams answer:

- What happened?
- Which records support this finding?
- Is the information verified, reported, inferred, or conflicting?
- Which materials, orders, factories, and shipments may be affected?
- What is the potential business impact?
- Which facts are still missing?
- What should be investigated next?
- Which actions require human approval?
- Did the intended resolution actually occur?

The system combines deterministic business logic, evidence retrieval, bounded AI capabilities, event-driven visibility, and human decision-making.

### Core principle

**AI prepares the investigation. Authorized people review consequential decisions. The system verifies the outcome.**

The platform must never confuse a plausible AI-generated explanation with an established business fact.

---

## 2. Problem Statement

Supply-chain disruptions are difficult to investigate because:

1. Operational information is fragmented across systems.
2. Supplier communications may be incomplete, delayed, or inconsistent.
3. Inventory quantities may include reserved, damaged, held, or otherwise unusable stock.
4. Purchase orders and production requirements may change.
5. A disruption may affect several downstream orders or facilities.
6. Manual investigation consumes time and requires coordination across teams.
7. AI summaries alone cannot establish the truth of conflicting operational records.
8. Existing alerts often report an event without tracking whether the business outcome was resolved.

A useful investigation platform must connect relevant records, preserve source provenance, calculate impact correctly, expose uncertainty, and maintain an auditable path from detection to verified outcome.

---

## 3. Product Vision

Build a secure operational intelligence workspace that transforms incoming supply-chain signals into evidence-backed investigations and measurable resolutions.

### Product objectives

- Detect potentially significant operational disruptions.
- Reduce unnecessary manual searching across disconnected records.
- Identify dependencies between suppliers, materials, orders, factories, and shipments.
- Calculate potential impact using deterministic business rules.
- Make evidence, contradictions, and missing information visible.
- Route uncertain or consequential cases to the appropriate human reviewer.
- Track decisions and action execution.
- Measure investigation quality and verified outcomes.
- Minimize unnecessary AI inference and sensitive data exposure.

### Non-goals for the initial version

The first version is not intended to be:

- A replacement for an ERP or inventory management system.
- An unrestricted autonomous procurement agent.
- A generic conversational chatbot.
- A system that treats every incoming message as a confirmed disruption.
- A platform that executes consequential actions without authorization.
- A large distributed microservice architecture before its need is established.
- A production-connected system that assumes synthetic data is real.
- A system that claims business savings without measuring them.

The initial product should be a working, testable investigation workflow using synthetic data and controlled integrations.

---

## 4. Core Features

The following describes the target product. These features are not necessarily implemented yet.

### 4.1 Signal ingestion

Receive operational signals from supported sources, potentially including:

- Supplier emails.
- ERP purchase-order updates.
- Inventory changes.
- Production planning systems.
- Quality inspection records.
- Shipment and logistics updates.
- Uploaded documents.
- Manually reported incidents.

Each source should have an explicit adapter and validation boundary.

### 4.2 Normalization and deduplication

Convert incoming records into a consistent internal representation.

Detect duplicate signals using source identifiers or carefully designed fingerprints.

Preserve original source references and avoid merging records that are only superficially similar.

### 4.3 Hybrid triage

Combine deterministic rules and lightweight classification to determine the appropriate processing path.

Possible outcomes include:

- Clearly irrelevant.
- Relevant and eligible for investigation.
- Uncertain and requiring additional review.
- Potentially related to an existing case.
- High-impact or conflicting and requiring conservative handling.

Uncertain signals must not be silently discarded.

### 4.4 Evidence retrieval

Retrieve relevant records within the user's authorized scope.

Potential evidence includes purchase orders, stock balances, reservations, production requirements, shipment updates, supplier commitments, and quality status.

Every finding must retain a traceable connection to its source.

### 4.5 Investigation workspace

Bring the relevant evidence into a single case view.

Display:

- Investigation summary.
- Source evidence.
- Verified facts.
- Reported claims.
- Inferences and assumptions.
- Conflicting records.
- Unknown or missing information.
- Impact calculations.
- Affected downstream entities.
- Recommended next steps.
- Review decisions and audit history.

### 4.6 Human review

Allow authorized users to review findings, correct extracted facts, request additional evidence, reject a recommendation, or approve a specific proposed action.

The system must preserve the reviewer's decision and its context.

### 4.7 Live processing visibility

Show actual signal-processing and investigation events.

The interface should expose which stages completed, which failed, which are awaiting review, and which require attention.

The frontend must not fabricate progress to simulate activity.

### 4.8 Supply-chain graph

Visualize relationships between entities such as:

Supplier → Purchase Order → Material → Production Order → Factory → Shipment.

Graph relationships must be supported by actual records or explicitly labeled inferences.

### 4.9 Reports and analytics

Provide evidence-backed reports about operational risk, investigation throughput, review workload, model efficiency, and verified resolution outcomes.

Metric definitions must be established before displaying them as authoritative.

### 4.10 Audit and security

Record important system events, access decisions, human approvals, and action execution results.

Restrict access to sensitive evidence, case details, and exports.

---

## 5. Primary Users

### Supply-chain manager

Needs visibility into supplier delays, material availability, order exposure, and downstream risk.

### Procurement specialist

Needs to investigate supplier commitments, purchase orders, alternative supply, and proposed procurement actions.

### Inventory or warehouse manager

Needs to verify physical availability, reservations, quality holds, and material discrepancies.

### Production planner

Needs to understand whether material or logistics disruptions affect production schedules and delivery commitments.

### Quality-control specialist

Needs to identify quality holds, inspection failures, and their effect on usable inventory.

### Operations manager

Needs cross-functional investigation summaries, escalation visibility, and verified resolution status.

### Auditor or administrator

Needs access controls, traceable evidence, review history, integration status, and security-relevant events.

Permissions must be defined by role and resource scope. The interface must not assume that every user can access every investigation or source record.

---

## 6. Example Investigation

Consider this illustrative scenario:

A supplier sends a message reporting that 8,000 meters of navy fabric will arrive four days later than expected.

A production order requires 6,000 meters by Friday. An inventory record reports 500 meters available.

These values are synthetic examples, not live factory data.

### Step 1: Receive the signal

The system records the incoming supplier message with its source identifier, timestamp, and permitted content reference.

### Step 2: Validate and triage

The system validates the message and classifies it as potentially relevant to supply-chain operations.

The message is not yet treated as proof of a confirmed delay.

### Step 3: Retrieve evidence

The investigation retrieves authorized records concerning:

- The supplier and purchase order.
- Fabric specification, color, and material variant.
- Inventory by warehouse or factory.
- Inventory reservations.
- Quality-release status.
- Production requirements and deadlines.
- Other expected deliveries.
- Shipment tracking and revised delivery estimates.

### Step 4: Calculate provisional impact

A simple subtraction gives:

`6,000 - 500 = 5,500 meters`

However, this is only a provisional deficit under the assumption that the reported 500 meters is the only usable supply.

The system must verify material identity, units, reservations, stock usability, location, other incoming supply, and current production requirements before presenting a shortage as confirmed.

### Step 5: Identify uncertainty

Suppose the inventory record does not specify whether the 500 meters are reserved.

The case should explicitly state:

- Reported requirement: 6,000 meters.
- Reported stock: 500 meters.
- Provisional deficit: 5,500 meters.
- Unverified fact: whether the stock is available for this order.
- Required next step: retrieve reservation and stock-status records.

### Step 6: Present the investigation

The workspace shows the supplier message, supporting records, calculations, unknowns, and possible downstream consequences.

Each claim links to its evidence.

### Step 7: Request human review

An authorized reviewer can confirm the facts, request more evidence, or approve a specific proposed action.

The system cannot automatically place an order or promise a new delivery date.

### Step 8: Track the outcome

If an action is approved and executed, record the actual execution result.

The case should be considered resolved only when the relevant resolution criteria are satisfied and the outcome has been verified.

---

## 7. System Architecture

The implementation should begin as a modular application with explicit boundaries.

### 7.1 Logical architecture

```text
Operational Sources
  |
  v
Source Adapters
  |
  v
Validation and Normalization
  |
  v
Deduplication
  |
  v
Hybrid Triage
  |
  +---- Clearly irrelevant ----> Minimal permitted audit record
  |
  +---- Uncertain / high impact ----> Review or conservative investigation
  |
  v
Authorized Evidence Retrieval
  |
  v
Fact Extraction and Provenance
  |
  v
Deterministic Impact Calculation
  |
  v
Investigation Case and Persisted Events
  |
  v
Human Review and Approval
  |
  v
Authorized Action Execution
  |
  v
Outcome Verification
```

The frontend consumes authorized API responses and persisted event updates. It is not the authority for business decisions or permissions.

### 7.2 Architectural responsibilities

**Source adapters**

Translate external source formats into validated internal records.

**Triage**

Apply deterministic rules and optional lightweight classification.

**Evidence service**

Retrieve and reference relevant authorized records.

**Investigation engine**

Coordinate bounded processing steps and maintain case state.

**Impact engine**

Perform deterministic business calculations.

**AI provider adapter**

Expose a replaceable interface for structured extraction, classification, and explanation.

**Review and action service**

Enforce authorization, approval, validation, and execution requirements.

**Event service**

Persist processing and case events and make authorized events available to consumers.

**Reporting service**

Calculate documented operational metrics from persisted data.

**Frontend**

Present investigations, evidence, review queues, live activity, reports, and audit information.

### 7.3 Data stores

A relational database such as PostgreSQL is the proposed initial authoritative store.

Additional storage technologies should be introduced only when justified.

A vector index may help with semantic retrieval. A graph database may become useful for complex dependency traversal. Neither is mandatory for the first version.

### 7.4 Event delivery

Use persisted backend events as the source of truth for the Live Activity interface.

Server-Sent Events (SSE) are a reasonable initial choice for one-way backend-to-browser updates.

The implementation must define event identifiers, authorization scope, reconnection behavior, duplicate handling, and safe event payloads.

---

## 8. Investigation Lifecycle

A proposed case lifecycle is:

1. `received`
2. `triaging`
3. `investigating`
4. `needs_review`
5. `awaiting_approval`
6. `approved`
7. `executing`
8. `awaiting_verification`
9. `resolved`

Additional terminal or exceptional states may include:

- `rejected`
- `dismissed`
- `failed`
- `cancelled`
- `blocked`

The exact state machine must be documented and validated before implementation.

Not every case follows every state. For example, a low-impact informational investigation may not require an approval step.

### State-transition rules

- Transitions must be validated by the backend.
- Each transition must preserve the relevant audit history.
- A failed operation must not be represented as a successful transition.
- An approval must reference the exact proposed action being approved.
- Changed action parameters may invalidate an existing approval.
- Resolution requires defined criteria, not merely closure by a timer.
- Reopening a case must preserve its prior history.

---

## 9. AI and Hybrid Intelligence

The platform should use the simplest reliable method for each task.

### Deterministic processing

Use conventional application code for:

- Schema validation.
- Deduplication rules.
- Permissions.
- Quantity arithmetic.
- Unit validation.
- Inventory availability rules.
- Deadline comparisons.
- State transitions.
- Approval enforcement.
- Audit recording.

### Lightweight classification

Use rules or a lightweight classifier for high-volume, low-complexity triage where it improves performance and reliability.

Measure false negatives and false positives before relying on automated filtering.

### LLM-assisted processing

Use a language model where unstructured information requires interpretation.

Potential uses include:

- Extracting candidate facts from supplier messages.
- Identifying likely references to purchase orders or materials.
- Summarizing authorized evidence.
- Identifying contradictions.
- Suggesting missing questions.
- Producing evidence-grounded explanations.

All model outputs must be validated and linked to their supporting sources.

### Provider strategy

The development strategy should begin with:

1. A deterministic mock AI provider.
2. A stable typed provider interface.
3. An optional local Ollama adapter, if compatible with the chosen backend.
4. An optional remote provider only with explicit configuration and data authorization.

A failed local model must not trigger a silent remote API fallback.

### Efficiency requirements

- Avoid model calls for trivial deterministic decisions.
- Retrieve only relevant evidence.
- Bound model input and output sizes.
- Bound retries and execution time.
- Limit tool calls and investigation steps.
- Measure latency and token usage where available.
- Avoid caching sensitive results without correct authorization and invalidation.
- Preserve an explicit degraded state when AI is unavailable.

---

## 10. MCP and Tool Integration

Model Context Protocol (MCP) may be used to expose narrowly scoped tools to AI-assisted workflows.

MCP is an integration protocol, not the investigation engine or authorization system.

### Initial tool strategy

Start with read-only tools such as:

- `get_purchase_order`
- `get_inventory_balance`
- `get_inventory_reservations`
- `get_production_order`
- `get_supplier_delivery_status`
- `get_shipment_status`
- `search_quality_records`

These names are examples of potential tool interfaces, not implemented tools.

Each tool must define:

- A strict input schema.
- A strict output schema.
- Authorization requirements.
- Tenant and resource scope.
- Timeout and result-size limits.
- Error behavior.
- Audit metadata.
- Data freshness expectations.

Avoid unrestricted SQL execution, shell access, and general-purpose write tools.

Write-capable tools should be introduced only after human approval, authorization, validation, idempotency, and audit controls are operational and tested.

---

## 11. UI/UX and Visualization

The interface should resemble a professional enterprise investigation and operational intelligence workspace.

It should prioritize clarity, evidence density, fast navigation, and trustworthy operational status.

### 11.1 Primary navigation

The proposed navigation is:

1. Overview.
2. Live Activity.
3. Investigations.
4. Review Queue.
5. Supply Chain Graph.
6. Reports & Analytics.
7. Evidence Explorer.
8. Integrations.
9. Audit & Security.
10. Settings.

Implement these routes incrementally. Do not build empty, nonfunctional pages merely to fill the navigation.

### 11.2 Overview dashboard

Potential widgets include:

- Active investigations.
- Investigations awaiting review.
- Orders potentially at risk.
- Provisional material shortages.
- Recent incoming signals.
- Investigation-stage distribution.
- Processing latency.
- Resolution and verification trends.
- Recent critical events.

All displayed values must come from a documented source. Synthetic development values must be labeled as demo data.

### 11.3 Live Activity

Show a chronological event stream and an investigation-stage view.

Each real event may display:

- Timestamp.
- Signal or case identifier.
- Processing stage.
- Actual status.
- Duration, when measurable.
- Evidence retrieved.
- Rule or model involved, where safe and useful.
- Error or retry information.
- Token usage or latency when available.
- Link to the related investigation.

Example event categories include signal receipt, triage completion, evidence retrieval, impact calculation, review request, and action execution.

Never invent event timings or display fake progress percentages as actual processing status.

### 11.4 Investigation detail

Organize the workspace around:

- Case summary.
- Evidence and source records.
- Findings and claim statuses.
- Impact calculations.
- Related supply-chain entities.
- Investigation timeline.
- Missing information.
- Conflicting evidence.
- Recommended actions.
- Human decisions.
- Audit history.

Make it easy to distinguish verified facts from reported claims and inferences.

### 11.5 Review Queue

Present pending decisions with enough context to review them safely.

Show:

- Why review is required.
- Relevant evidence.
- Uncertainties and conflicts.
- Potential impact.
- Exact proposed action and parameters.
- Required permission.
- Approve, reject, or request-more-evidence options, according to authorization.

Do not make approval buttons available as a substitute for backend authorization.

### 11.6 Supply Chain Graph

Represent real relationships between suppliers, purchase orders, materials, inventory, production orders, factories, and shipments.

Support focused exploration and filtering. Distinguish verified links from inferred relationships.

A graph visualization does not, by itself, require a graph database.

### 11.7 Reports and analytics

Potential report categories:

- Operational risk and exposure.
- Material shortage trends.
- Investigation throughput.
- Time to detection.
- Time to resolution.
- Review backlog.
- Human overrides.
- Model latency and usage.
- Classification errors.
- Verified resolution outcomes.

Define each metric's formula, time window, denominator, and source before treating it as authoritative.

### 11.8 Visual design principles

- Consistent typography, spacing, and component sizing.
- Restrained colors and meaningful status indicators.
- Dense but readable operational tables.
- Accessible contrast and keyboard navigation.
- Responsive layouts.
- Clear loading, empty, error, and stale-data states.
- Light and dark themes where supported.
- Minimal decorative animation.
- No generic chatbot as the primary interface.
- No fabricated charts or unsupported claims.

---

## 12. Technology Stack

The final stack must be confirmed against the actual repository before implementation.

The following is the proposed starting direction, not a claim that these dependencies are already installed.

| Layer | Proposed technology | Purpose |
|---|---|---|
| Frontend | Next.js and React | Application interface and routing |
| Language | TypeScript with strict checking | Type safety and maintainability |
| Styling | Tailwind CSS | Consistent design system |
| UI primitives | shadcn/ui | Accessible, reusable components |
| Charts | A compatible React chart library | Operational analytics |
| Graph visualization | React Flow or another suitable library | Interactive relationship exploration |
| Backend | A typed backend stack selected after repository inspection | APIs and business workflows |
| Authoritative database | PostgreSQL | Cases, evidence references, events, decisions, and audit data |
| AI provider | Mock provider first; optional local Ollama adapter | Bounded AI-assisted tasks |
| Live updates | SSE initially, if requirements fit | Server-to-browser event delivery |
| Tool integration | MCP where justified | Standardized access to approved tools |
| Testing | Frameworks compatible with the chosen stack | Unit, integration, security, and end-to-end verification |
| Deployment | To be decided based on security and operational requirements | Reproducible deployment |

### Technology selection rules

- Inspect existing package files before choosing dependencies.
- Prefer the smallest set of tools that satisfies the current requirements.
- Avoid multiple competing component libraries.
- Avoid a graph database or vector database before a concrete requirement exists.
- Avoid microservices and message brokers until justified by scale or isolation needs.
- Keep AI provider implementations replaceable.
- Record significant architecture decisions in `docs/adr/`.

---

## 13. Repository Structure

The following is the target structure. The actual repository may initially contain fewer files.

```text
supply-chain-investigator/
├── AGENTS.md
├── README.md
├── .env.example
├── .gitignore
│
├── .agents/
│   └── skills/
│       ├── architecture-decision/
│       ├── design/
│       ├── implement-phase/
│       ├── security-review/
│       ├── ui-styling/
│       ├── ui-ux-pro-max/
│       └── ui-ux-review/
│
├── .cursor/
│   └── rules/
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── domain-workflow.md
│   ├── implementation-roadmap.md
│   ├── security-threat-model.md
│   ├── token-efficiency.md
│   ├── ui-ux-guidelines.md
│   └── adr/
│       └── README.md
│
├── prompts/
│   ├── 00-plan-first.md
│   ├── 01-phase-0.md
│   ├── 02-phase-1.md
│   ├── 03-phase-2.md
│   ├── 04-phase-3.md
│   ├── 05-phase-4.md
│   ├── 06-phase-5.md
│   ├── 07-phase-6.md
│   ├── 08-security-review.md
│   ├── 09-ux-review.md
│   ├── 10-shadow-pilot.md
│   └── 11-ui-design.md
│
└── src/ or the repository's chosen application layout
```

The final source layout depends on the selected backend and frontend architecture. Do not create every listed directory in advance if it has no implemented purpose.

Each skill directory must retain the required skill definition file and any supporting resources used by the installed coding environment.

---

## 14. Development Setup

### 14.1 Prerequisites

The exact prerequisites depend on the stack selected for this repository.

For the proposed frontend, verify the required versions of:

- Node.js.
- The existing package manager.
- Git.
- A supported development environment.

PostgreSQL and Ollama may be introduced when the corresponding implementation phase requires them. They are not prerequisites for a purely frontend prototype using synthetic data.

### 14.2 Inspect the repository first

Before installing dependencies or executing setup commands, inspect the root directory and identify the actual package manager and scripts.

Examples of useful inspection commands on macOS:

```bash
pwd
ls -la
find . -maxdepth 2 -type f | sort
```

These commands inspect the repository. They do not install dependencies or change application files.

### 14.3 Install dependencies

Use the package manager already established by the repository.

For example, use the relevant command only when its corresponding manifest and lockfile exist:

```bash
npm install
```

For a repository using another package manager, follow its existing configuration instead. Do not create a second lockfile unnecessarily.

### 14.4 Start development

Use the development script defined in the actual package configuration.

For a configured Next.js application, the command may be:

```bash
npm run dev
```

Do not assume this command works until the application and script exist.

### 14.5 Verification commands

Run the commands that are actually configured, which may include:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

These are examples, not guaranteed existing scripts. Inspect the package configuration and use the correct commands.

### 14.6 Local AI

When the local model integration phase begins, verify that Ollama is installed, the intended model is available, and the backend can reach the local Ollama service.

A model's availability does not guarantee that its outputs are valid or that inference will meet latency requirements.

Do not require a running model for unrelated functionality or unit tests. Use the mock provider for deterministic tests.

### 14.7 Phase 1 commands (verified)

These commands were run successfully against the current repository state (Next.js 16, React 19, Tailwind v4, Vitest). Package manager: npm (`package-lock.json`).

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # 0 errors; 1 known warning (TanStack Table is not React Compiler compatible)
npm run typecheck
npm test
npm run build
```

Node 22 or newer is required. If Node is not installed system-wide, a project-local copy may be unpacked into `.tools/node` (git-ignored) and put first on `PATH`; see `docs/adr/0001-frontend-stack.md`.

The app reads **synthetic fixtures** only, behind `src/lib/data`. To review every UI state without a backend, append `?scenario=` to any page: `ok` (default), `empty`, `error`, `denied` or `stale`, for example `/live-activity?scenario=stale`. The scenarios exist only in the fixture data source.

Design rules for the interface are in `docs/ui-ux-guidelines.md`. The event contract is in `docs/event-schema.md`.

### 14.8 Phase 2: ingestion with Supabase

Phase 2 adds signal ingestion, deduplication and deterministic triage. Rules and the HTTP contract are in
`docs/signal-ingestion.md`; the persistence decision is `docs/adr/0002-supabase-postgres-persistence.md`.

Pick a data source with `DATA_SOURCE` in `.env.local` (copy `.env.example`; real values are never committed):

- `fixtures` (default): the Phase 1 recorded replay. No setup. Ingestion is disabled.
- `memory`: development only. Seeded synthetic signals in server memory, reset on restart.
- `database`: Supabase Postgres. Setup:
  1. Create a Supabase project for **synthetic data only** (not a production project).
  2. Project Settings > Database > Connection string > **Session pooler**; put it in `DATABASE_URL`
     (the direct connection is IPv6-only). It is server-only; never prefix it with `NEXT_PUBLIC_`.
  3. Generate an ingest key: `openssl rand -hex 32`, and put it in `INGEST_API_KEY`.
  4. Set `DATA_SOURCE=database` (and `ENABLE_SYNTHETIC_SUBMIT=true` to show the submit sheet).
  5. `npm run db:migrate` applies `supabase/migrations/*.sql` and records them in `app_migrations`. It is
     idempotent and refuses to run if an applied migration file was edited.
  6. `npm run db:seed` seeds the synthetic business records (Phase 3) and sends the labelled synthetic
     submissions through the real pipeline. If the tenant already has signals it only sends submissions
     whose record id is not stored yet (`--force` replays all; `--refresh-records` moves record dates
     relative to today and bumps `record_version`).

Submit a signal:

```bash
curl -X POST http://localhost:3000/api/signals \
  -H "Authorization: Bearer $INGEST_API_KEY" -H "Content-Type: application/json" \
  -d '{"sourceType":"supplier_email","sourceSystem":"synthetic-demo","sourceRecordId":"MSG-1",
       "label":"Supplier notice: PO-99001 lining delayed three days",
       "excerpt":"Delivery of PO-99001 delayed by three days.",
       "references":{"purchaseOrder":"PO-99001"},"dataMode":"synthetic"}'
```

| Variable | Required | Purpose |
|---|---|---|
| `DATA_SOURCE` | no (`fixtures`) | `fixtures`, `memory` or `database` |
| `DATABASE_URL` | when `database` | Supabase Session pooler connection string. Server-only |
| `INGEST_API_KEY` | for `POST /api/signals` | Bearer key, at least 24 characters. Maps to the server tenant |
| `DEMO_TENANT_ID` | no (`tenant-demo`) | Tenant the key maps to |
| `ENABLE_SYNTHETIC_SUBMIT` | no (`false`) | Shows the submit sheet in a store mode |
| `ENABLE_OPERATOR_ACTIONS` | no (`false`) | Shows "Open investigation" and "Re-run investigation" in a store mode. Still requires a signed-in session. |
| `SESSION_SECRET` | (blank) | HMAC key for the session cookie, min 32 characters |
| `DEMO_REVIEWER_PASSWORD` / `DEMO_PROCUREMENT_PASSWORD` / `DEMO_MANAGER_PASSWORD` | (blank) | Seeded demo users; hashes only are stored |
| `AI_PROVIDER` | no (`none`) | Phase 4: `none`, `mock` (deterministic, not a model) or `ollama` (local only) |
| `OLLAMA_BASE_URL` | no (`http://127.0.0.1:11434`) | Loopback address only |
| `OLLAMA_MODEL` | when `ollama` | Local model name, e.g. `qwen2.5:3b` |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | no (`15000` / `1`) | Per-attempt timeout (1000-60000) and retries (0-2) |
| `DATABASE_POOL_MAX` | no (`5`) | Connection pool size, 1-20 |
| `TEST_DATABASE_URL` | no | Runs `src/lib/store/postgres.live.test.ts` against a throwaway schema |

Verification commands used in Phase 2: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`.

### 14.9 Phase 3: evidence, impact and investigations

Rules, data model and limits are in `docs/investigation.md`. In `memory` and `database` modes every stored
signal that triage marks `high_impact`, `relevant` or `related_existing` creates or joins an investigation
case; `uncertain` signals are held until an operator opens them. After pulling Phase 3 on an existing
Supabase project:

```bash
npm run db:migrate                     # applies 0002_business_records and 0003_investigations
npm run db:seed                        # business records + the README navy-fabric signal (MSG-2101)
npm run db:investigate -- --backfill   # investigates stored signals that have no case yet, oldest first
```

Restart `npm run dev` after changing `.env.local`.

### 14.10 Phase 4: AI fact extraction

Details, limits and the validation rules are in `docs/ai-extraction.md`. A provider suggests candidate facts
from a signal's text; they are validated, checked against the text, compared with the rule values and shown in
the case workspace and the signal trace. They are never used in calculations, triage or case rules. AI is
off by default (`AI_PROVIDER=none`).

```bash
npm run db:migrate                     # applies 0004_ai_extractions
# Deterministic mock (not a model), useful for demos:
AI_PROVIDER=mock npm run db:extract -- --backfill [--limit N]
# Local model:
ollama pull qwen2.5:3b
# then in .env.local: AI_PROVIDER=ollama and OLLAMA_MODEL=qwen2.5:3b
npm run ai:smoke                       # one synthetic extraction; prints counts only, writes nothing
```

---

## 15. Environment Configuration

Keep secrets out of source control.

Maintain `.env.example` as a sanitized list of required and optional configuration keys.

Potential configuration categories include:

| Category | Example purpose |
|---|---|
| Application | Environment name and application URL |
| Database | Database connection configuration |
| Authentication | Session or identity-provider configuration |
| AI provider | Provider selection and local model configuration |
| Event delivery | SSE and event-retention configuration |
| Logging | Log level and telemetry settings |
| Integrations | Credentials for explicitly enabled source adapters |

Phase 2 variables are listed in section 14.8 and in `.env.example`. They are validated at first use (`src/lib/env.ts`); a missing or malformed value fails with a message that names the variable and never echoes it.

Do not include real passwords, access tokens, personal credentials, or production endpoints in the example file.

Do not expose server-only secrets to the browser.

Validate required configuration during application startup and fail with a clear, non-sensitive error when required values are missing.

---

## 16. Development Workflow

### 16.1 Read before changing

Before each task:

1. Read `AGENTS.md`.
2. Read this README.
3. Inspect the current repository state.
4. Read relevant architecture, workflow, security, and UI documentation.
5. Inspect applicable rules and skills.
6. Identify dependencies and acceptance criteria.

### 16.2 Plan significant changes

For significant features, identify:

- Intended behavior.
- Relevant modules and files.
- Data contracts.
- Authorization requirements.
- Error states.
- Tests.
- Acceptance criteria.
- Potential architectural changes.

Wait for approval when the task requires a significant decision and approval has not already been given.

### 16.3 Implement in small phases

Keep each phase small enough to understand, test, and review.

Do not build the complete system in one large code-generation operation.

Prefer working vertical slices that connect a real user interaction to the relevant domain logic and persistence.

### 16.4 Review the result

After implementation:

- Inspect changed files.
- Run relevant tests.
- Run linting and type checking where configured.
- Review security-sensitive changes.
- Check the browser UI when a visual change is involved.
- Update documentation.
- Report failures honestly.

### 16.5 Git practices

Use focused commits when appropriate.

Do not commit secrets, local databases, model weights, generated build output, or unrelated personal files.

Review the contents of a commit before publishing it.

---

## 17. Testing and Quality Assurance

Testing is part of implementation, not a final optional stage.

### Unit tests

Test deterministic calculations, validation, triage rules, deduplication, and state transitions.

### Integration tests

Test database operations, authorized evidence retrieval, API behavior, event persistence, AI provider boundaries, and review workflows.

### Security tests

Test tenant isolation, authorization failures, forged approvals, prompt-injection attempts, malicious tool outputs, and sensitive-data exposure.

### Frontend tests

Test navigation, loading and error states, evidence labels, review controls, and live-event behavior.

### End-to-end tests

A representative end-to-end scenario should:

1. Ingest a synthetic supplier signal.
2. Validate and normalize it.
3. Deduplicate and triage it.
4. Retrieve authorized evidence.
5. Calculate a provisional impact.
6. Create an investigation.
7. Display its actual persisted events.
8. Request human review where required.
9. Record the review decision.
10. Verify the resulting audit trail.

Tests must not require live production credentials or external supplier systems.

Use deterministic fixtures and a mock AI provider wherever possible.

---

## 18. Security and Privacy

Security must be implemented throughout the application.

### Access control

- Authenticate protected users.
- Authorize every protected operation on the backend.
- Enforce tenant isolation across records, events, evidence, caches, jobs, and exports.
- Restrict source evidence to users with appropriate access.
- Revalidate approval and authorization at action execution time.

### Data protection

- Keep secrets out of source control.
- Avoid logging sensitive source content unnecessarily.
- Apply encryption appropriate to the deployment environment.
- Define data retention and deletion policies.
- Restrict downloads and exports.
- Minimize the data sent to AI providers.

### AI and tool safety

- Treat documents, emails, and tool results as untrusted input.
- Validate model outputs.
- Enforce tool permissions independently of the model.
- Prevent arbitrary SQL and shell execution.
- Do not allow AI-generated text to override authorization rules.
- Do not silently send confidential data to remote providers.
- Do not silently fall back from local inference to external APIs.

### Human approval

Require explicit authorization before consequential external actions.

Record the exact approved action, relevant parameters, reviewer, execution status, and outcome.

---

## 19. Observability and Metrics

The system must distinguish operational activity from verified business outcomes.

### Processing metrics

Potential metrics include:

- Signals received.
- Validation failures.
- Duplicate signals.
- Triage classifications.
- Investigation creation rate.
- Evidence retrieval latency.
- Investigation processing latency.
- AI latency and failures.
- Token usage where available.
- Tool-call failures.
- Event-delivery failures.

### Investigation metrics

Potential metrics include:

- Active investigations.
- Cases awaiting review.
- Time to first useful finding.
- Time to human decision.
- Time to verified resolution.
- Human corrections.
- False-positive rate.
- False-negative rate, when it can be measured credibly.
- Verified resolution rate.

### Business metrics

Potential metrics include:

- Orders affected by confirmed disruptions.
- Confirmed material shortages.
- Production orders exposed to risk.
- Verified delays avoided.
- Verified reductions in resolution time.

Do not claim avoided losses, saved costs, or improved delivery performance without a defensible measurement method.

Document each metric's definition, data source, calculation, time window, and limitations.

---

## 20. Implementation Roadmap

Build in the following order unless repository inspection or validated requirements justify a change.

### Phase 0 — Planning and repository contract

**Goal:** Establish the real repository state and approved implementation plan.

Deliverables:

- Repository inspection.
- Architecture and domain boundaries.
- Verified development commands.
- UI/UX direction.
- Data and event contracts.
- Initial acceptance criteria.

**Acceptance criteria:** The implementation plan matches the actual repository, major assumptions are documented, and no unnecessary files or dependencies have been created.

### Phase 1 — Working dashboard shell

**Goal:** Build the first usable interface.

Deliverables:

- Application shell.
- Sidebar and top bar.
- Consistent design tokens.
- Responsive layout.
- Overview page using labeled synthetic data.
- Live Activity page structure.
- Reusable components.
- Loading, empty, error, and stale-data states.

**Acceptance criteria:** The application starts successfully, navigation works, the pages are usable, and no synthetic metric is represented as live operational data.

### Phase 2 — Signal ingestion and triage

**Goal:** Accept and classify synthetic supply-chain signals.

Deliverables:

- Typed signal schema.
- Validation.
- Normalization.
- Deduplication.
- Deterministic triage.
- Persisted processing outcomes.

**Acceptance criteria:** Repeated inputs are handled according to documented deduplication rules, malformed data is rejected safely, and uncertain signals remain visible.

### Phase 3 — Evidence and impact calculation

**Goal:** Produce evidence-backed investigations.

Deliverables:

- Evidence schema.
- Source references.
- Authorized retrieval interfaces.
- Claim statuses.
- Contradiction and missing-data handling.
- Deterministic impact calculations.
- Investigation persistence.

**Acceptance criteria:** Every important finding can be traced to evidence or clearly marked as unverified, and calculations have tests.

### Phase 4 — AI provider integration

**Goal:** Introduce bounded AI assistance.

Deliverables:

- Mock provider.
- Typed provider interface.
- Structured extraction and validation.
- Optional local model adapter.
- Bounded retries, timeouts, and output sizes.

**Acceptance criteria:** Malformed model outputs cannot bypass business rules, and core tests run without requiring a live LLM.

### Phase 5 — Human review and approvals

**Goal:** Support controlled decisions.

Deliverables:

- Review queue.
- Review decisions.
- Proposed-action records.
- Authorization enforcement.
- Approval versioning.
- Audit records.
- Execution-status tracking.

**Acceptance criteria:** Unauthorized actions are rejected by the backend, approval applies to the correct action parameters, and decisions are auditable.

**Phase 5 status:** implemented. Sign-in uses a signed httpOnly session cookie (ADR 0003). People can create a reviewer account, and Google sign-in works when the server OAuth client is set (ADR 0004). Review decisions, versioned proposed actions, synthetic execution (`sent: false`) and independent outcome verification are persisted. The ingest API remains key-based. See `docs/review-and-actions.md`.

### Phase 6 — MCP and source integrations

**Goal:** Connect approved external systems safely.

Deliverables:

- Read-only tool interfaces.
- Strict schemas.
- Server-side authorization.
- Source adapters.
- Timeout and error handling.
- Integration health reporting.

**Acceptance criteria:** Tool calls are bounded, tenant-scoped, and auditable. No arbitrary SQL or unrestricted shell tools are exposed.

**Phase 6 status:** implemented. A real MCP server exposes read-only tools over stdio (`npm run mcp`) and authenticated HTTP (`POST /api/mcp` with `MCP_API_KEY`). Tools wrap `BusinessRecordReader` with zod schemas, timeouts, row caps and append-only `tool_calls` audit. HTTPS adapters (`mailbox.v1`, `erp_po.v1`, `carrier.v1`) poll configured base URLs (or the local mock on port 3099); unconfigured connectors show "not configured". Integrations and Live Activity (`?filter=integration`) render persisted tool/connector events with a 5s poll—no fabricated health. See `docs/mcp-and-integrations.md` and ADR 0005.

### Phase 7 — Reports and supply-chain visualization

**Goal:** Explain broader operational dependencies and performance.

Deliverables:

- Documented report metrics.
- Operational charts.
- Focused supply-chain graph.
- Evidence-backed relationships.
- Filters and drill-down navigation.

**Acceptance criteria:** Charts use persisted, correctly defined data; inferred relationships are distinguishable from verified ones; users can navigate from a visualization to the underlying records.

**Phase 7 status:** implemented (close-out). Report metrics are documented in `docs/reports-and-metrics.md` with formulas, windows and sources; the Reports page source line matches fixtures vs persisted store mode. The supply-chain graph shows verified FK edges plus inferred edges from signal reference co-mentions. Graph source sheets link to filtered Investigations (`?ref=`) and Evidence (`?q=`). Export remains disabled. Time-to-detect/resolve and chart libraries are deferred. Data remains synthetic / demo-tenant labelled.

### Phase 8 — Security, reliability, and shadow pilot

**Goal:** Validate real-world behavior before enabling consequential automation.

Deliverables:

- Security review.
- Tenant-isolation tests.
- Reliability and failure testing.
- Performance measurements.
- Read-only shadow pilot.
- Human-verified comparison of findings.
- Documented go/no-go criteria.

**Acceptance criteria:** Known failure modes are addressed, findings can be audited, and automation is not enabled beyond the explicitly approved scope.

---

## 21. Definition of Done

A feature is complete only when its applicable requirements are met.

- [ ] The implementation matches the approved scope.
- [ ] The relevant project rules and skills have been followed.
- [ ] Data contracts and business rules are explicit.
- [ ] Authorization is enforced by the backend.
- [ ] Error and edge cases are handled.
- [ ] Relevant tests pass.
- [ ] Linting and type checking pass where configured.
- [ ] UI states are accessible and usable.
- [ ] Documentation is updated.
- [ ] No secrets or sensitive data have been committed.
- [ ] No unrelated user work has been overwritten.
- [ ] Known limitations are documented.
- [ ] Verification results reflect commands actually executed.

---

## 22. Current Limitations

Until implemented and verified, the following must not be assumed to exist:

- Production supplier or ERP integrations.
- Live factory inventory data.
- Real-time operational event ingestion.
- A functioning investigation engine.
- A configured PostgreSQL database. Persistence code exists (Phase 2) but only runs when you provide `DATABASE_URL`.
- A connected AI model provider.
- MCP servers or external tool integrations.
- Real operational dashboards or reports.
- Automated action execution.
- Verified business savings or resolution improvements.
- Production deployment or production-grade security certification.

Synthetic data is appropriate for development and demonstration, but it must remain distinguishable from real operational data.

**Phase 1 status:** the repository contains a runnable interface shell (Overview, Live Activity, Investigations, and one fully detailed synthetic investigation, INV-2041) on labelled synthetic fixtures. Live Activity is a recorded replay of fixture events, not a live stream. The shortage calculation (`src/lib/impact/shortage.ts`) is real deterministic code with unit tests, but it runs over fixture inputs. There is no backend, authentication, database, event stream, AI provider, MCP integration or approval workflow; the Approve and Reject controls are disabled by design.

**Phase 2 status:** signal ingestion (`POST /api/signals`), strict validation, normalization, deduplication (`dedupe.v1`) and deterministic triage (`triage.v1`) are implemented, with persisted signals and append-only events visible in Live Activity and Overview when `DATA_SOURCE` is `memory` or `database`. Limitations: the Supabase migration, seed and live repository-contract suite (`TEST_DATABASE_URL`) have not been run against a hosted Supabase project in this repository's verification; the SQL was exercised through PGlite (in-process Postgres) and the `postgres` driver and CLI scripts against a local Postgres-protocol server only. There is no user authentication (one shared ingest key maps to one demo tenant), the rate limiter is per process, cases and Overview metrics are still fixtures, and there is no live event push, so pages show a snapshot taken at load time. No AI model, evidence retrieval, impact calculation, review or approval workflow exists yet.

**Phase 3 status:** synthetic business records (0002) and append-only investigation runs, evidence, claims, conflicts, unknowns and impact calculations (0003) are persisted; cases are created or linked by `case-rules.v1` after the signal commits, with deterministic `shortage.v1` and `delivery-risk.v1` results labelled verified or provisional. The Investigations list, case detail and Overview read persisted cases in store modes. No AI model is used, no action is proposed or approved (the case page says so), operator actions are unauthenticated and behind `ENABLE_OPERATOR_ACTIONS`, business records only change through the seed script, and pages are still load-time snapshots.

**Phase 4 status:** a provider interface with a deterministic mock and a loopback-only Ollama adapter extracts candidate facts (`signal-extraction.v1`) from stored signals. Output is schema-validated and grounded in the source text, compared with the rule values and stored append-only in `ai_extractions` (0004) with `extraction.*` events. Suggestions are displayed only; no calculation, triage, claim or case decision uses them. AI is off by default. The Ollama adapter is tested against a mocked HTTP layer; extraction quality with a real local model has not been measured. There is no remote provider and no fallback between providers.

**Phase 5 status:** signed-in roles (`reviewer`, `procurement`, `manager`) are required for the app shell. Review Queue and case proposed-action controls call server actions; the server rejects anonymous, wrong-role and stale-version posts. Synthetic execution never updates suppliers, inventory or purchase orders. `action.execution_completed` does not resolve a case. Reports count stored `outcome.verified` events only. Export and settings edits remain disabled.

**UI status:** every primary navigation route is a real page. Unauthenticated visitors see `/login`. Nothing on these pages invents metrics or claims a source is healthy.

This section should be updated as capabilities become operational.

---

## 23. Contributing and Engineering Rules

### Project source of truth

Use the following hierarchy when making engineering decisions:

1. Explicit user requirements and approvals.
2. `AGENTS.md` and applicable project rules.
3. Approved architecture decisions and relevant documentation.
4. Existing implementation and established contracts.
5. Relevant installed skills and their instructions.
6. Reasonable engineering defaults where no decision exists.

If a conflict is material, identify it rather than silently making an irreversible choice.

### Documentation

Update documentation when behavior, configuration, architecture, data contracts, security boundaries, or development commands change.

Record significant trade-offs in architecture decision records.

### Dependencies

Add dependencies only when they provide a clear benefit.

Check compatibility with existing versions before introducing a new package.

### Scope control

Do not implement future phases prematurely.

Do not add AI agents, graph databases, vector databases, message brokers, or other infrastructure simply because they appear in the long-term vision.

### Final principle

**Every important conclusion must have a traceable basis. Every consequential action must be authorized. Every claimed outcome must be verifiable.**

The objective is not to build the largest possible AI system. It is to build a reliable investigation platform that helps people make better supply-chain decisions with less manual effort and greater accountability.