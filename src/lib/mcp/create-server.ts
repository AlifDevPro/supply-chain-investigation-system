import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";
import { invokeTool, McpToolError, type McpHostDeps, type ToolCallActor } from "./host";
import { MCP_TOOL_NAMES, TOOL_DESCRIPTIONS, toolInputSchemas } from "./tools";

/** Builds an MCP server whose tools wrap BusinessRecordReader via the audited tool host. */
export function createMcpServer(deps: McpHostDeps, actor: ToolCallActor): McpServer {
  const server = new McpServer({ name: "supply-chain-investigation", version: "0.1.0" });
  for (const name of MCP_TOOL_NAMES) {
    const schema = toolInputSchemas[name];
    server.registerTool(
      name,
      {
        description: TOOL_DESCRIPTIONS[name],
        inputSchema: schema,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        try {
          const out = await invokeTool(deps, name, args, actor);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(out.result, null, 2) }],
            structuredContent: {
              callId: out.callId,
              truncated: out.truncated,
              rowCount: out.rowCount,
              result: out.result as Record<string, unknown>,
            },
          };
        } catch (error) {
          const message =
            error instanceof McpToolError
              ? error.message
              : error instanceof ZodError
                ? "Invalid tool arguments."
                : "The tool failed.";
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }
  return server;
}
