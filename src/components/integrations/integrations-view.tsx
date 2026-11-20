import { Panel } from "@/components/common/panel";
import { IntegrationActivity } from "@/components/integrations/integration-activity";
import type { IntegrationsViewData } from "@/components/integrations/types";
import { formatDateTime } from "@/lib/format";

export function IntegrationsView({ data }: { data: IntegrationsViewData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ingest API" description="Observed submissions. This card does not claim the API is healthy.">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
            <dt className="text-muted-foreground">Ingest key</dt>
            <dd>{data.ingest.keyConfigured ? "configured" : "not configured"}</dd>
            <dt className="text-muted-foreground">Last signal received</dt>
            <dd className="font-mono text-xs">
              {data.ingest.lastReceived ? formatDateTime(data.ingest.lastReceived) : "none recorded"}
            </dd>
          </dl>
          {data.ingest.bySystem.length === 0 ? (
            <p className="mt-3 text-dense text-text-tertiary">No signals are stored.</p>
          ) : (
            <ul className="mt-3 space-y-1.5" aria-label="Signals by source system">
              {data.ingest.bySystem.map((s) => (
                <li key={s.system} className="flex justify-between gap-3 text-dense">
                  <span>{s.system}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.count} · last {formatDateTime(s.lastReceived)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Database" description="How this process is reading records.">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="font-mono text-xs">{data.store.mode}</dd>
            <dt className="text-muted-foreground">Applied migrations</dt>
            <dd>
              {data.store.migrations
                ? `${data.store.migrations.length} recorded in app_migrations`
                : "not a database (fixtures or in-memory). RLS status is only read from Postgres."}
            </dd>
          </dl>
          {data.store.migrations ? (
            <ul className="mt-3 space-y-1 font-mono text-xs" aria-label="Applied migrations">
              {data.store.migrations.map((m) => (
                <li key={m.name}>
                  {m.name} · {formatDateTime(m.appliedAt)}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="AI provider" description="Configured now. Suggestions are not used in calculations.">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{data.ai.label ?? "off (AI_PROVIDER=none)"}</dd>
            <dt className="text-muted-foreground">Stored extractions</dt>
            <dd className="font-mono text-xs">{data.ai.count}</dd>
            <dt className="text-muted-foreground">Latest status</dt>
            <dd>{data.ai.latestStatus ?? "none recorded"}</dd>
            <dt className="text-muted-foreground">Latest recorded</dt>
            <dd className="font-mono text-xs">{data.ai.latestAt ? formatDateTime(data.ai.latestAt) : "none recorded"}</dd>
          </dl>
        </Panel>
      </div>

      <IntegrationActivity initial={data} />
    </div>
  );
}
