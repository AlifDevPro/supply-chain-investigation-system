import { Button } from "@/components/ui/button";
import { Panel } from "@/components/common/panel";
import type { SettingsData } from "@/lib/data/pages";

export function SettingsView({ data }: { data: SettingsData }) {
  return (
    <div className="space-y-5">
      <Panel title="Runtime" description="Server configuration. Secret values are shown only as set or not set.">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
          <dt className="text-muted-foreground">DATA_SOURCE</dt>
          <dd className="font-mono text-xs">{data.dataSource}</dd>
          <dt className="text-muted-foreground">DEMO_TENANT_ID</dt>
          <dd className="font-mono text-xs">{data.tenantId}</dd>
          <dt className="text-muted-foreground">DATABASE_URL</dt>
          <dd>{data.databaseUrl}</dd>
          <dt className="text-muted-foreground">INGEST_API_KEY</dt>
          <dd>{data.ingestKey}</dd>
          <dt className="text-muted-foreground">SESSION_SECRET</dt>
          <dd>{data.sessionSecret}</dd>
          <dt className="text-muted-foreground">Google sign-in</dt>
          <dd>{data.googleSignIn}</dd>
          <dt className="text-muted-foreground">Auth mode</dt>
          <dd>{data.authMode}</dd>
          <dt className="text-muted-foreground">ENABLE_SYNTHETIC_SUBMIT</dt>
          <dd>{data.enableSyntheticSubmit ? "true" : "false"}</dd>
          <dt className="text-muted-foreground">ENABLE_OPERATOR_ACTIONS</dt>
          <dd>{data.enableOperatorActions ? "true" : "false"}</dd>
        </dl>
      </Panel>
      <Panel title="AI extraction" description="Local providers only. There is no remote fallback.">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
          <dt className="text-muted-foreground">AI_PROVIDER</dt>
          <dd className="font-mono text-xs">{data.aiProvider}</dd>
          <dt className="text-muted-foreground">OLLAMA_MODEL</dt>
          <dd>{data.ollamaModel}</dd>
          <dt className="text-muted-foreground">OLLAMA_BASE_URL</dt>
          <dd className="font-mono text-xs">{data.ollamaBaseUrl}</dd>
          <dt className="text-muted-foreground">AI_TIMEOUT_MS</dt>
          <dd className="font-mono text-xs">{data.aiTimeoutMs} per attempt</dd>
          <dt className="text-muted-foreground">AI_MAX_RETRIES</dt>
          <dd className="font-mono text-xs">{data.aiMaxRetries}</dd>
        </dl>
      </Panel>
      <Panel title="Rule versions" description="Deterministic rule and prompt versions running in this process.">
        <ul className="space-y-1 font-mono text-xs" aria-label="Rule versions">
          {Object.entries(data.ruleVersions).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Preferences" description="Theme is changed from the header. Other settings are not editable here.">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled aria-describedby="settings-edit">
            Edit settings
          </Button>
          <p id="settings-edit" className="text-xs text-muted-foreground">
            Disabled: configuration is edited in the server environment, not from this page.
          </p>
        </div>
      </Panel>
    </div>
  );
}
