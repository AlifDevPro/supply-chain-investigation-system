# ADR 0005: MCP server and HTTPS source adapters

- Status: Accepted (Phase 6 plan approved by the project owner: real MCP for Cursor, configurable HTTPS adapters)
- Date: 2026-11-14

## Context

Phase 6 must connect approved external systems safely (`AGENTS.md` §9, README §10). The Integrations page
still lists mailbox, ERP and carrier as planned. There is no MCP package and no tool-call audit path.
Investigation already has a tenant-scoped `BusinessRecordReader` with row caps. The owner chose a real MCP
server (Cursor/external clients) and configurable HTTPS adapters plus a local mock source server—not
product-specific SDKs (Gmail/SAP/AfterShip).

## Options

1. **In-app HTTP tools only (no MCP protocol).** Lowest dependency cost, but Cursor cannot attach as an MCP
   client. Rejected by the owner (choice 1B).
2. **Hand-rolled JSON-RPC without the SDK.** Avoids a dependency, but Cursor expects the MCP protocol and
   transport details change over time.
3. **`@modelcontextprotocol/sdk` + in-process tool host.** Stdio entry for local Cursor, authenticated HTTP
   for remote clients. Tools wrap `BusinessRecordReader`. HTTPS adapters call configured base URLs with
   bearer keys; a mock server on loopback supplies synthetic JSON for demos.

## Decision

Option 3.

- Dependency: `@modelcontextprotocol/sdk` (justified for protocol correctness with Cursor).
- Auth: `MCP_API_KEY` (Bearer) for HTTP; stdio inherits process env. Tenant is always `DEMO_TENANT_ID`, never
  a tool argument. Ingest remains a separate key.
- Tools: read-only only (`get_purchase_order`, inventory, reservations, requirements, shipment(s), lot quality).
  Zod schemas, timeouts, row caps, append-only `tool_calls` audit.
- Adapters: `mailbox.v1`, `erp_po.v1`, `carrier.v1` under `src/lib/integrations/`. Env unset → “not
  configured”. Mock server `scripts/mock-external-sources.ts` (port 3099) for demos. `dataMode` stays
  `synthetic` for mock traffic.
- Visualization: real `tool_*` and `connector_*` events on Integrations and Live Activity; 5s client poll.
  No fabricated progress.

## Consequences

- A new runtime dependency and an npm script (`mcp`) for stdio.
- Misconfigured MCP keys fail closed. Adapter credentials are server-only (Settings: set/not set).
- Write tools remain forbidden until a later phase revisits governance.
- Live Activity pages remain load-time snapshots unless the Integrations poll refreshes recent rows.

## Revisit criteria

- Cursor requires a different MCP transport than the SDK supports: upgrade or replace the SDK.
- A named product connector (Gmail, SAP, AfterShip) is required: add a product-specific ADR.
- Full-pipeline SSE replaces the 5s poll for Live Activity.
