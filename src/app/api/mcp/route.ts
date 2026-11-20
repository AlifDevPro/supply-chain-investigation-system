import { handleMcpHttp } from "@/lib/mcp/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleMcpHttp(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpHttp(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpHttp(request);
}
