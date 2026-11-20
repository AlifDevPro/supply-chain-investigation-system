/** Client-safe view of Integrations page data (no server-only imports). */
export type ConnectorCardData = {
  id: "mailbox" | "erp_po" | "carrier";
  label: string;
  version: string;
  configured: boolean;
  lastRun: {
    id: string;
    status: string;
    at: string;
    signalsIngested: number;
    errorClass: string | null;
    httpStatusClass: string | null;
  } | null;
};

export type IntegrationsViewData = {
  ingest: {
    keyConfigured: boolean;
    bySystem: Array<{ system: string; count: number; lastReceived: string }>;
    lastReceived: string | null;
  };
  store: { mode: string; migrations: Array<{ name: string; appliedAt: string }> | null };
  ai: { label: string | null; latestStatus: string | null; latestAt: string | null; count: number };
  mcp: {
    keyConfigured: boolean;
    tools: Array<{ name: string; description: string }>;
    recentCalls: Array<{
      id: string;
      toolName: string;
      status: string;
      at: string;
      durationMs: number | null;
      errorClass: string | null;
    }>;
  };
  connectors: ConnectorCardData[];
  canOperate: boolean;
  operateReason: string | null;
};
