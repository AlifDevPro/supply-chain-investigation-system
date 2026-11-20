# Phase 6 security review (MCP and HTTPS adapters)

Review date: 2026-11-14. Scope: MCP host/HTTP/stdio and connector adapters only.

## Trust boundaries

| Boundary | Control |
| --- | --- |
| Browser → app | Session cookie; Integrations actions require signed-in reviewer+ |
| MCP client → `/api/mcp` | Bearer `MCP_API_KEY` (separate from ingest); rate limit; 503 if unset |
| Stdio MCP | Local process env only; same tool host and audit |
| Tool args → reader | Zod schemas; tenant always `DEMO_TENANT_ID`; never from args |
| Adapter → external HTTP | HTTPS or loopback HTTP; bearer key; `redirect: "error"`; body/timeout caps |
| Events / audit | Append-only `tool_calls` / `connector_runs`; metadata is safe scalars only |

## Findings

1. **Mitigated — tenant override.** Tool arguments cannot set tenant. Verified by host unit test.
2. **Mitigated — write tools.** Only the documented read-only catalog is registered; no SQL or shell tools.
3. **Mitigated — secrets in UI/events.** Settings and Integrations show set/not set. Event metadata excludes keys and payloads. Security test asserts `.env.example` blanks and no client import of server modules.
4. **Mitigated — unconfigured adapters.** Env unset → skipped run with `not_configured`; UI never claims connected/healthy without a recorded poll.
5. **Accepted risk — stdio inherits process env.** Documented in ADR 0005 and `docs/mcp-and-integrations.md`. Operators must not expose the stdio process to untrusted users.
6. **Accepted risk — MCP key maps to demo tenant.** Same pattern as ingest; multi-tenant MCP keys are out of scope for Phase 6.

## Residual

- Full-pipeline SSE and product OAuth connectors remain future work.
- Operators should rotate `MCP_API_KEY` and connector keys if they were ever committed or logged.
