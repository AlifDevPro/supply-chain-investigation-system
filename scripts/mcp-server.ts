/**
 * Stdio MCP server for Cursor / MCP Inspector. Inherits process env (never browser-exposed).
 * Run: npm run mcp
 * Requires DATA_SOURCE=memory or database and a store with business records.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "@/lib/mcp/create-server";
import { EnvError, parseEnv } from "@/lib/env";
import { getRuntime, mcpHostDeps } from "@/lib/runtime";

async function main() {
  try {
    parseEnv(process.env);
  } catch (error) {
    console.error(error instanceof EnvError ? error.message : "Invalid environment.");
    process.exit(1);
  }
  const runtime = await getRuntime();
  if (!runtime) {
    console.error("DATA_SOURCE=fixtures has no live store. Use memory or database for MCP.");
    process.exit(1);
  }
  const server = createMcpServer(mcpHostDeps(runtime), { kind: "stdio", id: "stdio" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MCP server failed.");
  process.exit(1);
});
