import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { getMcpLimiter, getRuntime, mcpHostDeps } from "@/lib/runtime";
import { createMcpServer } from "./create-server";

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest();

function keysMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

function bearer(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function json(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Authenticated MCP over Streamable HTTP (JSON responses). Tenant always comes from DEMO_TENANT_ID.
 */
export async function handleMcpHttp(request: Request): Promise<Response> {
  const env = getEnv();
  if (!env.MCP_API_KEY) {
    logEvent("warn", "mcp.disabled");
    return json(503, { error: { code: "mcp_disabled", message: "MCP is not configured." } });
  }

  const presented = bearer(request);
  if (presented === null || !keysMatch(presented, env.MCP_API_KEY)) {
    logEvent("warn", "mcp.unauthorized");
    return json(401, { error: { code: "unauthorized", message: "A valid MCP bearer key is required." } }, {
      "www-authenticate": "Bearer",
    });
  }

  const rate = getMcpLimiter().check(digest(presented).toString("hex"));
  if (!rate.allowed) {
    logEvent("warn", "mcp.rate_limited");
    return json(429, { error: { code: "rate_limited", message: "Too many MCP requests." } }, {
      "retry-after": String(rate.retryAfterSeconds),
    });
  }

  const runtime = await getRuntime();
  if (!runtime) {
    return json(503, { error: { code: "store_unavailable", message: "No store is configured for MCP." } });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMcpServer(mcpHostDeps(runtime), { kind: "mcp_key", id: "mcp_key" });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => undefined);
  }
}
