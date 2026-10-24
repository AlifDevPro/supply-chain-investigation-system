## 1. Project Identity

**Project name:** Supply Chain Investigation Platform  
**Domain:** Garment manufacturing, supplier operations, inventory, production, logistics, and supply-chain risk investigation  
**Product category:** Enterprise operational intelligence and human-supervised AI investigation system

### Mission

Build a reliable, secure, evidence-driven platform that helps garment factories identify, investigate, understand, and resolve supply-chain disruptions.

The system must connect fragmented operational signals, retrieve relevant business evidence, calculate potential business impact, explain uncertainty, recommend appropriate next steps, and support authorized human decisions.

The platform must optimize for verified operational outcomes, not merely AI-generated answers or ticket closure.

### Product principles

1. Evidence before conclusions.
2. Deterministic calculations before LLM-generated arithmetic.
3. Human authorization before consequential business actions.
4. Explicit uncertainty instead of fabricated certainty.
5. Traceable decisions instead of opaque AI behavior.
6. Real operational events instead of simulated live animations.
7. Security and tenant isolation by design.
8. Simple, modular architecture before distributed complexity.
9. Useful investigation workflows before decorative dashboards.
10. Measurable outcomes instead of unsupported AI performance claims.

## 2. Instructions for Coding Agents

You are an engineering agent working on an existing repository. You must inspect the repository before changing it.

### Mandatory working procedure

Before implementing a task:

1. Read this file.
2. Read the relevant sections of `README.md`.
3. Inspect the existing directory structure, package configuration, source files, database schema, migrations, tests, and environment configuration relevant to the task.
4. Read relevant documentation under `docs/`.
5. Inspect applicable project rules and skills.
6. Identify the current implementation and avoid duplicating existing functionality.
7. Formulate a small implementation plan.
8. Identify security, data integrity, architectural, and user-experience implications.
9. Implement only the requested and approved scope.
10. Run appropriate checks and inspect the resulting changes.
11. Report what changed, what was tested, and what remains incomplete.

For tasks that involve multiple components, architectural decisions, security-sensitive behavior, or significant scope, present a plan and wait for approval before implementing unless the user has explicitly authorized implementation.

For small, clearly specified changes, proceed without unnecessary planning overhead.

### Skill usage

Inspect available skills under `.agents/skills/` and follow their actual instructions when applicable.

Relevant skills may include:

- `architecture-decision`
- `design`
- `implement-phase`
- `security-review`
- `ui-styling`
- `ui-ux-pro-max`
- `ui-ux-review`

Use the architecture skill for meaningful structural decisions, the design skill for product and interface planning, the implementation skill for phase-based work, and the security review skill for security-sensitive changes.

Use the UI/UX Pro Max and UI styling skills when creating or refining interfaces. Use the UI/UX review skill to evaluate completed interface work.

These names describe the skills expected in this repository. Verify the actual directory names and `SKILL.md` contents before invoking or relying on them.

Do not assume that a skill ran merely because its directory exists. Follow the invocation mechanism supported by the installed coding environment.

### Repository preservation

- Never overwrite existing user work without inspecting it.
- Do not delete files merely because they appear unused.
- Do not replace project configuration wholesale to simplify implementation.
- Do not regenerate lockfiles unnecessarily.
- Do not remove tests to make a failing build pass.
- Do not disable linting, type checking, authorization, or security controls to bypass errors.
- Do not silently introduce breaking changes.
- Do not claim that commands passed unless they were actually executed successfully.
- Do not claim that a feature is complete if its backend, error handling, or required tests are missing.

## 3. Product Scope

The platform investigates disruptions such as:

- Supplier delivery delays.
- Material shortages.
- Inventory discrepancies.
- Quality inspection failures and material holds.
- Missing or inconsistent purchase-order documents.
- Production bottlenecks.
- Shipment delays.
- Order deadline risks.
- Supplier communications that conflict with operational records.
- Dependencies between materials, purchase orders, production orders, factories, and shipments.

### Example investigation

A supplier email states that 8,000 meters of navy fabric will arrive four days late.

A production order requires 6,000 meters by Friday, and an inventory record reports 500 meters available.

The system must not immediately declare a confirmed shortage of 5,500 meters.

It must first determine, where data is available:

- Whether the material variant and specification match.
- Whether all quantities use compatible units.
- Which warehouse or factory the inventory belongs to.
- Whether the 500 meters are physically available, quality-released, and usable.
- Whether stock is reserved for another order.
- Whether other purchase orders or suppliers can cover the requirement.
- Whether the supplier's message is confirmed, revised, or contradicted by shipment records.
- Whether the production requirement and deadline are current.
- Whether the delayed quantity affects this particular order.

Until the relevant facts are verified, label the calculated shortage as provisional and expose the missing evidence.

## 4. Core Functional Architecture

The logical investigation workflow is:

1. Receive an operational signal.
2. Validate the signal and its source.
3. Normalize its structure and timestamps.
4. Deduplicate it using stable identifiers or carefully defined fingerprints.
5. Perform deterministic filtering and lightweight triage.
6. Retrieve relevant, authorized business records.
7. Extract claims and facts with source provenance.
8. Detect missing, inconsistent, stale, or contradictory information.
9. Calculate operational impact using deterministic application code.
10. Create or update an investigation case.
11. Present findings, evidence, uncertainty, and recommendations.
12. Request human review when required.
13. Execute an approved action only after authorization and validation.
14. Observe the actual result and record whether the outcome was verified.

Not every signal requires a full investigation. Clearly irrelevant signals may follow a minimal, auditable processing path under the configured retention policy.

Uncertain, conflicting, high-impact, or potentially related signals must not be silently discarded. Route them through an appropriate review or conservative investigation path.

The implementation may evolve, but these logical responsibilities must remain identifiable and testable.

## 5. Architecture Principles

### 5.1 Begin with a modular monolith

Prefer a modular application with clear boundaries over premature microservices.

The initial implementation should use a small number of deployable components and explicit internal interfaces.

Do not introduce distributed infrastructure merely because the platform may eventually grow.

Possible future components include:

- Separate ingestion workers.
- Dedicated model-serving infrastructure.
- Message brokers.
- Graph databases.
- Vector databases.
- Distributed task queues.
- Separate MCP servers.

Introduce these only when measured requirements justify their operational and maintenance costs.

### 5.2 Keep responsibilities separate

Maintain clear boundaries between:

- User interface and backend APIs.
- Domain rules and presentation logic.
- Database access and business logic.
- AI provider adapters and investigation orchestration.
- Evidence extraction and verified business facts.
- Deterministic calculations and LLM-generated explanations.
- Authentication, authorization, and feature behavior.
- Event persistence and live browser updates.
- Recommendations and action execution.

Do not put business-critical calculations in React components or rely on the frontend to enforce security.

### 5.3 Use explicit interfaces

Define stable, typed interfaces for:

- Incoming signals.
- Normalized records.
- Evidence items.
- Investigation cases.
- Claims and extracted facts.
- Impact calculations.
- Investigation events.
- Review decisions.
- Proposed actions.
- Approval records.
- Action execution results.
- AI provider requests and responses.

Use schema validation at external boundaries. Reject malformed or unsupported data with clear errors.

Avoid passing unstructured dictionaries throughout the application when a well-defined domain type is appropriate.

### 5.4 Keep changes incremental

Implement a working vertical slice before building every feature.

After each phase, the application should remain runnable and testable.

Do not create placeholder modules for every future capability unless they establish a useful, agreed-upon interface.

## 6. Data and Evidence Integrity

### 6.1 Provenance is mandatory

Every material finding must be traceable to its underlying evidence.

Where applicable, retain:

- Source system.
- Source record identifier.
- Source type.
- Tenant and access scope.
- Observation or receipt timestamp.
- Source-reported timestamp, if different.
- Relevant content location or field.
- Extraction method.
- Verification status.
- Record version or update timestamp.
- Reference to the associated case and event.

A source message is evidence of what the source reported. It is not automatically proof that the reported event occurred.

### 6.2 Distinguish claim states

Represent and display meaningful distinctions between:

- **Verified:** supported by the required authoritative evidence or verification process.
- **Reported:** explicitly stated by a source but not independently confirmed.
- **Inferred:** derived from evidence through a documented inference.
- **Assumed:** temporarily accepted for analysis but not verified.
- **Unknown:** required information is unavailable.
- **Conflicted:** relevant sources disagree.
- **Stale:** information may no longer reflect current conditions.

Do not collapse these states into a single confidence score.

If a confidence estimate is used, define its meaning and limitations. Do not present an LLM's self-reported confidence as a calibrated probability.

### 6.3 Preserve source records

Do not silently rewrite original source evidence during normalization or extraction.

Keep original evidence separate from normalized representations and AI-generated summaries.

Protect sensitive source content with appropriate access controls and retention policies.

Avoid copying entire emails, documents, or supplier records into every case when a reference and a minimal relevant excerpt are sufficient.

### 6.4 Missing data must remain visible

If a required field is missing, record that it is missing.

Never invent supplier commitments, inventory values, order deadlines, material specifications, or verification results.

Do not infer that an empty result means that a record does not exist unless the relevant search scope and data completeness justify that conclusion.

## 7. Deterministic Business Logic

Business-critical calculations must be implemented in deterministic application code.

Examples include:

- Required material quantities.
- Available-to-use inventory.
- Reserved inventory.
- Material deficits.
- Delivery date differences.
- Order exposure.
- Impacted production orders.
- Deadline calculations.
- Quantities expressed in compatible units.

Before calculations, validate units, material identity, location, reservation status, relevant time, and the required business rules.

Define how rounding, time zones, invalid inputs, and missing quantities are handled.

LLMs may extract candidate values or explain the result, but they must not replace the authoritative calculation.

Each material impact calculation should preserve, where applicable:

- Input values.
- Input source references.
- Units.
- Calculation method or rule version.
- Calculation timestamp.
- Relevant assumptions.
- Verification state.
- Result.

Recalculate when relevant authoritative data changes.

## 8. AI and Model Usage

### 8.1 Use AI only where it adds value

Appropriate uses include:

- Extracting structured facts from unstructured communications.
- Classifying operational signals.
- Identifying potentially related records.
- Summarizing evidence.
- Highlighting contradictions.
- Suggesting investigation questions.
- Producing evidence-grounded explanations.
- Proposing possible next steps.

Prefer deterministic rules for simple, stable conditions.

Do not invoke an LLM for every incoming signal by default.

### 8.2 Keep model providers replaceable

Define a provider interface so the application can support:

- A deterministic mock provider for development and testing.
- A local Ollama-backed provider where compatible.
- An optional remote provider only when explicitly configured and approved.

Provider-specific logic must not leak throughout the domain layer.

The absence of a configured model must not make the entire application unusable. Support an explicit unavailable or degraded AI state where appropriate.

Never silently switch to an external provider when a local provider fails.

### 8.3 Treat model output as untrusted

Validate model outputs against strict schemas.

Reject malformed values, unsupported enumerations, missing required fields, invalid references, and out-of-range values.

The model must not be allowed to:

- Grant itself permissions.
- Change tenant scope.
- Bypass business rules.
- Execute arbitrary SQL or shell commands.
- Modify authoritative business records directly.
- Approve its own proposed actions.
- Override human decisions.
- Invent evidence references.
- Treat instructions inside supplier messages or documents as trusted system instructions.

Use explicit limits for input size, output size, execution time, retries, and tool calls.

### 8.4 Preserve token and latency efficiency

Use a tiered processing strategy:

1. Deterministic validation and filtering.
2. Lightweight classification when useful.
3. Narrow retrieval of relevant authorized evidence.
4. Structured extraction or reasoning when necessary.
5. Human review when uncertainty or impact requires it.

Bound the number of model calls and retrieved records per task.

Avoid sending complete database records, entire documents, or full conversation histories when relevant excerpts suffice.

Track latency, token usage when available, model failures, retries, and cost estimates without logging unnecessary sensitive content.

Cache only when correctness, authorization, data freshness, and invalidation requirements are satisfied.

## 9. MCP and Tool Integration

MCP is a tool integration protocol. It is not the agent, database, authorization system, or workflow orchestrator.

When MCP integration is introduced:

- Begin with narrowly scoped read-only tools.
- Define input and output schemas.
- Validate every argument.
- Apply server-side authorization to every operation.
- Enforce tenant and resource scope.
- Apply timeouts and result-size limits.
- Record safe audit metadata.
- Handle unavailable tools and partial results explicitly.
- Treat tool output as untrusted evidence.
- Never expose arbitrary SQL execution or shell access as a general-purpose business tool.

Write-capable tools must not be introduced until the corresponding approval, authorization, idempotency, validation, and audit requirements are implemented.

A tool call is not proof that its intended business effect occurred.

## 10. Human Review and Action Governance

Consequential actions require explicit human approval.

Examples include:

- Sending supplier communications.
- Committing to a purchase.
- Changing an inventory record.
- Altering production schedules.
- Making commitments to buyers.
- Changing delivery commitments.
- Initiating other externally visible or financially consequential actions.

A recommendation is not authorization.

An approval must be linked to a specific proposed action and relevant parameters. If material parameters change after approval, require revalidation and, when appropriate, renewed approval.

Enforce permissions on the backend, not just by hiding frontend controls.

Record the approving identity, decision, relevant action version, timestamp, and execution result.

Use idempotency controls for retryable write operations where applicable.

Clearly distinguish:

- Proposed.
- Awaiting approval.
- Approved.
- Rejected.
- Executing.
- Executed.
- Failed.
- Outcome verified.

An alert being sent does not mean it was acknowledged. An action being requested does not mean it was executed. Execution does not prove the intended business outcome was achieved.

## 11. Live Activity and Event Architecture

Live Activity must represent real application events.

Do not simulate backend processing using timers, fabricated progress percentages, or hardcoded event streams in production.

### Event requirements

Each persisted event should contain an appropriate subset of:

- Unique event identifier.
- Tenant identifier.
- Case identifier, when applicable.
- Correlation or trace identifier.
- Event type.
- Processing stage.
- Status.
- Server-generated timestamp.
- Duration, when measurable.
- Safe structured metadata.
- Source or record references, when appropriate.
- Error classification, when applicable.

Do not put secrets, full sensitive messages, credentials, or unrestricted source payloads into event metadata.

### Event lifecycle

Support events appropriate to the real workflow, such as:

- `signal.received`
- `signal.validated`
- `signal.deduplicated`
- `triage.completed`
- `evidence.retrieved`
- `impact.calculated`
- `investigation.created`
- `investigation.updated`
- `investigation.needs_review`
- `review.completed`
- `action.approved`
- `action.execution_started`
- `action.execution_completed`
- `action.execution_failed`
- `outcome.verified`

These names are proposed conventions. Define and document the actual event schema before implementing the complete live pipeline.

Persist events before or as part of making them available to consumers, according to the chosen consistency design.

The UI must handle reconnection, duplicate delivery, out-of-order events where possible, stale connections, permission errors, and unavailable data.

Start with Server-Sent Events (SSE) when communication is predominantly backend-to-browser. Introduce WebSockets only when genuine bidirectional, low-latency requirements justify them.

## 12. UI/UX and Visual Design

The product must feel like a professional enterprise operational intelligence platform, not a generic AI chatbot or marketing website.

### Primary visual identity

The default theme must be light. Dark mode must be available as an alternative.

Use a refined industrial/editorial aesthetic with warm neutral backgrounds, white surfaces, charcoal typography, subtle borders, and restrained muted olive or moss accents. The interface should feel like professional supply-chain operations software, not a generic AI dashboard.

Avoid generic dark-navy and electric-blue AI styling, blue-purple gradients, neon glows, indiscriminate glassmorphism, decorative AI imagery, and unnecessary animations.

Apply these requirements consistently across the dashboard, investigation workspace, live activity, reports, graph visualization, and review queue. Read `.cursor/rules/40-frontend-ux.mdc` and follow the applicable UI/UX and styling skills when implementing interfaces.

### 12.1 Product interface

The proposed navigation includes:

- Overview.
- Live Activity.
- Investigations.
- Review Queue.
- Supply Chain Graph.
- Reports & Analytics.
- Evidence Explorer.
- Integrations.
- Audit & Security.
- Settings.

Implement routes incrementally and adjust them when validated user workflows require a different structure.

### 12.2 Visual direction

Use a restrained, information-dense enterprise design.

Requirements:

- A coherent spacing and typography system.
- Consistent colors, surfaces, borders, and status indicators.
- Clear hierarchy between operational summaries, case details, and evidence.
- Readable tables with appropriate sorting, filtering, and pagination.
- Useful empty, loading, error, permission-denied, and stale-data states.
- Responsive layouts that remain usable at narrower widths.
- Accessible keyboard navigation and focus indicators.
- Meaningful labels and accessible chart descriptions.
- Light and dark themes when supported by the chosen implementation.

Use color to communicate meaningful states, not as decoration.

Do not rely on color alone to communicate severity or verification status.

### 12.3 Dashboard

The Overview page may include:

- Active investigations.
- Cases awaiting review.
- Orders at risk.
- Material shortages under investigation.
- Recently received signals.
- Investigation stage distribution.
- Processing latency.
- Resolution and verification trends.
- Recent important events.

Only display a metric as live or authoritative when the underlying data supports that claim.

Label synthetic demo data clearly. Never invent operational performance statistics.

### 12.4 Investigation workspace

An investigation detail page should help users answer:

1. What happened?
2. Why might it matter?
3. Which evidence supports the finding?
4. Which facts are verified?
5. Which claims conflict?
6. What remains unknown?
7. Which orders, materials, factories, or shipments are affected?
8. What action is recommended?
9. Who must approve the action?
10. What actually happened after the action?

Provide evidence links, event timelines, impact explanations, and a readable audit history.

### 12.5 Live Activity

Show the actual lifecycle of signals and investigations.

For each stage, display relevant real information, such as status, timestamp, duration, source reference, result, failure, retry, or associated case.

Never display a stage as completed merely because a frontend animation reached its endpoint.

### 12.6 Supply-chain visualization

Represent relationships between real or explicitly synthetic domain entities, such as:

Supplier → Purchase Order → Material → Production Order → Factory → Shipment.

Distinguish verified relationships from inferred relationships.

Allow users to inspect the source records behind meaningful nodes and edges.

Keep large graphs readable through filtering, progressive expansion, and focused views.

Do not introduce a graph database solely to render a graph in the frontend.

### 12.7 Reports

Reports may include:

- Operational exposure and risk.
- Material shortage trends.
- Investigation throughput.
- Time to detection and resolution.
- Review backlog.
- Human overrides and correction rates.
- AI latency and usage.
- Model and classification errors.
- Verified business outcomes.

Define metric formulas, time windows, denominators, and data sources before presenting a metric as authoritative.

Separate estimates, operational events, and verified outcomes.

## 13. Frontend Engineering Standards

If the existing repository does not dictate another compatible stack, the proposed frontend is:

- Next.js.
- React.
- TypeScript with strict checking.
- Tailwind CSS.
- shadcn/ui for accessible, reusable primitives.
- A suitable React chart library for analytics.
- A suitable graph visualization library when graph functionality is implemented.

Inspect the installed versions and existing configuration before choosing APIs or modifying dependencies.

### Component rules

- Prefer small, reusable components with clear responsibilities.
- Keep domain logic out of presentation components.
- Avoid giant page components.
- Avoid unnecessary global state.
- Use typed API contracts.
- Validate user input.
- Represent asynchronous states explicitly.
- Provide accessible labels and keyboard behavior.
- Use consistent status and severity components.
- Avoid duplicating functionality already provided by the existing component library.

Do not add multiple competing UI libraries without a clear need.

### Visual quality

Do not settle for an unstyled scaffold when the task requests a finished interface.

Avoid excessive gradients, decorative glass effects, unnecessary animation, oversized empty cards, meaningless charts, generic landing-page sections, and decorative AI imagery.

Use realistic synthetic records for development, but label them appropriately.

## 14. Backend Engineering Standards

Inspect the existing repository before selecting a backend stack.

Where no stack has been established, prefer a maintainable backend with typed domain models, schema validation, clear database boundaries, structured logging, and automated tests.

The backend must own:

- Authentication and authorization.
- Tenant and resource isolation.
- Business-rule validation.
- Evidence access.
- Impact calculations.
- Investigation state transitions.
- Approval enforcement.
- Action execution.
- Event persistence.
- Audit recording.

Frontend validation improves usability but does not replace backend validation.

Use explicit error types and appropriate HTTP status codes.

Do not expose stack traces, internal prompts, credentials, SQL details, or sensitive source payloads in client-facing errors.

## 15. Database and Domain Modeling

Prefer a relational database, such as PostgreSQL, for authoritative business records, investigation cases, decisions, event metadata, and audit history unless the existing architecture establishes a justified alternative.

Potential entities include:

- Tenant.
- User.
- Role and permission.
- Supplier.
- Material.
- Warehouse or factory.
- Inventory balance.
- Inventory reservation.
- Purchase order.
- Production order.
- Shipment.
- Source connection.
- Ingested signal.
- Evidence item.
- Extracted claim.
- Investigation case.
- Investigation event.
- Impact calculation.
- Review decision.
- Proposed action.
- Action execution.
- Audit event.

This is a conceptual domain inventory, not a requirement to create every table immediately.

Define relationships, constraints, indexes, lifecycle rules, and deletion/retention behavior before adding complex schema.

Use migrations for schema changes.

Do not modify production data or execute destructive migrations without explicit authorization and a recovery plan.

Use synthetic data in development.

## 16. Security and Privacy

Security is a core architectural requirement.

### Mandatory controls

- Authenticate users before protected operations.
- Enforce authorization on every protected backend request.
- Apply tenant isolation to database queries, events, caches, retrieved evidence, and background jobs.
- Validate all external input.
- Use parameterized database operations or safe query builders.
- Store secrets in environment configuration or an appropriate secrets manager, never in source control.
- Commit only sanitized `.env.example` files.
- Use TLS in deployed environments.
- Apply appropriate encryption at rest and in transit.
- Limit request sizes, execution times, and resource consumption.
- Use rate limiting where appropriate.
- Protect against prompt injection and malicious document content.
- Restrict AI tools to explicitly authorized operations.
- Record security-relevant actions in an audit trail.
- Apply retention and deletion policies to sensitive data.
- Avoid logging credentials, access tokens, or full sensitive source payloads.
- Protect exports and downloaded reports with appropriate authorization.

Do not trust tenant identifiers, user roles, case IDs, or resource permissions supplied by the browser without server-side verification.

Do not place privileged service credentials in frontend environment variables or client bundles.

### AI privacy

Do not transmit confidential business data to an external AI provider unless the provider, configuration, data scope, and use have been explicitly authorized.

Use local inference where appropriate and supported, but do not assume that local execution automatically guarantees secure storage, access control, or privacy.

Never silently fall back from local inference to a remote API.

## 17. Testing and Quality Assurance

Write tests for business behavior, not just implementation details.

### Minimum test categories

**Unit tests**
- Quantity and unit calculations.
- Material shortage calculations.
- Date and deadline calculations.
- Triage rules.
- State transitions.
- Input and output validation.
- Deduplication behavior.

**Integration tests**
- Database persistence.
- Tenant-scoped retrieval.
- API authorization.
- Event persistence and delivery.
- AI provider failures.
- Review and approval workflows.
- Migration behavior.

**Security tests**
- Cross-tenant access attempts.
- Unauthorized action execution.
- Forged or stale approvals.
- Malformed AI output.
- Prompt-injection attempts.
- Unauthorized tool calls.
- Sensitive information exposure.

**Frontend tests**
- Navigation.
- Loading and error states.
- Case detail rendering.
- Evidence status presentation.
- Review and approval controls.
- Empty and stale-data states.

**End-to-end tests**
- Ingest a synthetic signal.
- Process and classify it.
- Retrieve authorized evidence.
- Calculate impact.
- Create an investigation.
- Request human review.
- Record a review decision.
- Verify the resulting audit trail.

Do not claim comprehensive coverage without checking the actual test suite.

## 18. Observability and Reliability

Use structured logs and correlation identifiers to connect a source signal to its processing steps, investigation, and resulting actions.

Track relevant metrics such as:

- Ingestion volume.
- Duplicate rate.
- Triage outcomes.
- Investigation creation rate.
- Processing latency.
- Model latency and failures.
- Tool-call failures.
- Human-review backlog.
- Action failures.
- Verification rate.
- Human correction rate.
- Token usage and cost estimates where available.

Distinguish operational telemetry from business outcomes.

Provide clear handling for dependency failures, retries, timeouts, partial evidence retrieval, and unavailable model providers.

Retries must be bounded and safe. Use idempotency for operations that may be repeated.

Do not hide failed operations behind success-shaped responses.

## 19. Development Environment and Configuration

Inspect the actual runtime, package manager, scripts, and dependency versions before executing commands.

Use the repository's existing package manager and lockfile.

Keep local development reproducible.

Provide appropriate commands for setup, development, tests, linting, type checking, and database migrations in `README.md` after verifying the actual configuration.

Environment variables must be documented and validated.

Fail clearly when required configuration is missing. Optional capabilities should degrade explicitly rather than pretending to work.

Do not hardcode machine-specific paths, personal credentials, or environment assumptions.

## 20. Implementation Phases

The project should progress through small, reviewable phases.

### Phase 0 — Repository contract and planning

- Inspect repository and installed skills.
- Establish architecture and domain contracts.
- Document assumptions, dependencies, and risks.
- Confirm the initial stack and acceptance criteria.
- Avoid unnecessary code changes.

### Phase 1 — Working vertical slice

- Establish the application shell.
- Create the initial Overview and Live Activity page structures.
- Use clearly labeled synthetic data.
- Establish reusable components and basic backend/API boundaries as agreed.
- Add meaningful loading, empty, and error states.
- Keep the project runnable.

### Phase 2 — Signal ingestion and triage

- Define normalized signal schemas.
- Implement validation and deduplication.
- Add deterministic triage.
- Preserve uncertain signals.
- Persist processing outcomes.

### Phase 3 — Evidence and impact

- Implement authorized evidence retrieval.
- Preserve provenance.
- Identify missing and conflicting facts.
- Add deterministic impact calculations.
- Create investigation records.

### Phase 4 — AI provider integration

- Add a deterministic mock provider.
- Define a provider interface.
- Add an optional local model adapter when compatible.
- Validate model outputs.
- Bound resource consumption and retries.

### Phase 5 — Human review and action governance

- Add review decisions.
- Enforce authorization.
- Require approval for consequential actions.
- Persist action execution and audit records.
- Verify outcomes independently.

### Phase 6 — MCP and external integrations

- Add narrowly scoped read-only tools.
- Enforce authorization and schema validation.
- Add source adapters and safe error handling.
- Introduce write capabilities only after their governance controls are tested.

### Phase 7 — Analytics and operational hardening

- Define report metrics.
- Add graph exploration where justified.
- Complete security and reliability testing.
- Run a read-only shadow pilot against approved data.
- Compare findings with human-verified outcomes before enabling consequential automation.

These phases are a proposed sequence. The approved implementation plan and the repository's actual state determine the final order.

## 21. Definition of Done

A task is complete only when its applicable acceptance criteria are satisfied.

Before reporting completion, verify that:

- The implementation matches the requested scope.
- Relevant project rules and skills were followed.
- Type checking and linting pass where configured.
- Relevant tests pass.
- New business logic has appropriate tests.
- Authorization and tenant boundaries remain intact.
- Errors and edge cases are handled.
- UI states are usable and accessible.
- Documentation is updated where necessary.
- No credentials or sensitive data were added accidentally.
- No unrelated files were modified unnecessarily.
- Remaining limitations are documented honestly.

If a command cannot run because a dependency or environment is unavailable, report the limitation explicitly.

## 22. Communication and Decision Reporting

Use concise, technically precise explanations.

When presenting an implementation plan, include:

- Scope.
- Current repository assumptions.
- Files or modules expected to change.
- Architectural decisions.
- Relevant security implications.
- Acceptance criteria.
- Verification commands.

When reporting completed work, include:

1. What changed.
2. Important implementation decisions.
3. Tests and checks actually executed.
4. Results.
5. Known limitations.
6. Recommended next step.

Ask questions only when a missing decision materially affects correctness, safety, or architecture. Otherwise, state reasonable assumptions and keep moving within the approved scope.

Never claim that an integration, test, deployment, model, event stream, or business outcome is operational unless it has been verified.

## 23. Final Engineering Rule

Build a system that can explain what it knows, where that information came from, what remains uncertain, how its calculations were produced, which actions are authorized, and whether the intended outcome actually occurred.

Prefer a smaller, working, secure, testable system over a large collection of impressive but unverified features.