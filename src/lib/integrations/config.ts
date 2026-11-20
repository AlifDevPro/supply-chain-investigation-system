import type { AppEnv } from "@/lib/env";
import type { ConnectorId } from "@/lib/store/integration-types";

export interface ConnectorConfig {
  id: ConnectorId;
  label: string;
  version: string;
  path: string;
  baseUrl: string | null;
  apiKey: string | null;
}

export function connectorConfigs(env: AppEnv): ConnectorConfig[] {
  return [
    {
      id: "mailbox",
      label: "Supplier email mailbox",
      version: "mailbox.v1",
      path: "/mailbox/messages",
      baseUrl: env.MAILBOX_BASE_URL ?? null,
      apiKey: env.MAILBOX_API_KEY ?? null,
    },
    {
      id: "erp_po",
      label: "ERP purchase-order connector",
      version: "erp_po.v1",
      path: "/erp/purchase-orders",
      baseUrl: env.ERP_BASE_URL ?? null,
      apiKey: env.ERP_API_KEY ?? null,
    },
    {
      id: "carrier",
      label: "Carrier tracking feed",
      version: "carrier.v1",
      path: "/carrier/shipments",
      baseUrl: env.CARRIER_BASE_URL ?? null,
      apiKey: env.CARRIER_API_KEY ?? null,
    },
  ];
}

export function connectorConfig(env: AppEnv, id: ConnectorId): ConnectorConfig {
  const found = connectorConfigs(env).find((c) => c.id === id);
  if (!found) throw new Error(`Unknown connector: ${id}`);
  return found;
}

export function isConfigured(config: ConnectorConfig): boolean {
  return Boolean(config.baseUrl && config.apiKey);
}
