# MCP and HTTPS source integrations (Phase 6)

ADR: `docs/adr/0005-mcp-and-https-adapters.md`.

## MCP server

Read-only tools wrap `BusinessRecordReader`. Tenant is always `DEMO_TENANT_ID` from server env—never a tool argument.

| Transport | How |
| --- | --- |
| Stdio | `npm run mcp` (Cursor / MCP Inspector). Inherits process env; not exposed to the browser. |
| HTTP | `POST /api/mcp` (also GET/DELETE for Streamable HTTP). `Authorization: Bearer MCP_API_KEY`. |

| Tool | Reader method |
| --- | --- |
| `get_purchase_order` | `purchaseOrder` |
| `get_inventory_balance` | `inventory` |
| `get_inventory_reservations` | `reservations` |
| `get_production_requirements` | `requirements` |
| `get_shipment` | `shipment` |
| `get_shipments_for_po` | `shipmentsForPurchaseOrder` |
| `search_quality_by_lot` | `lotBalances` |

Bounds: zod input schemas, `MCP_TOOL_TIMEOUT_MS` (default 5s), `MAX_ROWS_PER_CALL`, rate limit on HTTP. No SQL, shell or write tools.

Every call appends `tool_calls` and `tool.called` / `tool.completed` / `tool.failed` events (stage `integration`).

### Cursor config example

```json
{
  "mcpServers": {
    "supply-chain-investigation": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": {
        "DATA_SOURCE": "memory",
        "DEMO_TENANT_ID": "tenant-demo"
      }
    }
  }
}
```

For HTTP: point the client at `http://localhost:3000/api/mcp` with header `Authorization: Bearer <MCP_API_KEY>`.

## HTTPS adapters

| Connector | Version | Env |
| --- | --- | --- |
| mailbox | `mailbox.v1` | `MAILBOX_BASE_URL`, `MAILBOX_API_KEY` |
| erp_po | `erp_po.v1` | `ERP_BASE_URL`, `ERP_API_KEY` |
| carrier | `carrier.v1` | `CARRIER_BASE_URL`, `CARRIER_API_KEY` |

Unset pair → UI shows **not configured**. Never "connected" or "healthy" without a recorded poll.

Fetch rules: HTTPS (or loopback HTTP for the mock), bearer key, `redirect: "error"`, body cap 16 KiB, timeout, no credential logging. Response must validate as `signalInputSchema` envelope or a health snapshot.

Poll: Integrations "Run connector now" (signed-in reviewer+) or `npm run integrations:poll`.

## Mock source server

```bash
npm run mock:sources
# then in .env.local:
# MAILBOX_BASE_URL=http://127.0.0.1:3099
# MAILBOX_API_KEY=mock-source-key-demo-only
# (same pattern for ERP_ / CARRIER_)
```

Serves synthetic JSON on `/mailbox/messages`, `/erp/purchase-orders`, `/carrier/shipments`. `dataMode` remains `synthetic`.

## Visualization

- Integrations: connector cards, MCP catalog, activity feed with 5s poll of persisted rows.
- Live Activity: `?filter=integration` shows stage `integration` events only.

No timer-based fake progress percentages.
