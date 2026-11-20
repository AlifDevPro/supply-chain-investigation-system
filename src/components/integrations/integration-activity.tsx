"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Panel } from "@/components/common/panel";
import { Chip } from "@/components/status/chip";
import {
  fetchIntegrationActivity,
  mcpSmokeCall,
  runConnectorNow,
  type IntegrationActionState,
  type IntegrationActivitySnapshot,
} from "@/app/(workspace)/integrations/actions";
import type { IntegrationsViewData } from "@/components/integrations/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const IDLE: IntegrationActionState = { status: "idle" };

function SubmitButton({ label, disabled, reason }: { label: string; disabled?: boolean; reason?: string | null }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      title={disabled ? reason ?? undefined : undefined}
      className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function ActionMessage({ state }: { state: IntegrationActionState }) {
  if (state.status === "idle") return null;
  return (
    <p className={cn("mt-2 text-dense", state.status === "error" ? "text-destructive" : "text-muted-foreground")} role="status">
      {state.message}
    </p>
  );
}

export function IntegrationActivity({ initial }: { initial: IntegrationsViewData }) {
  const [snapshot, setSnapshot] = useState<IntegrationActivitySnapshot | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [connectorState, connectorAction] = useActionState(runConnectorNow, IDLE);
  const [smokeState, smokeAction] = useActionState(mcpSmokeCall, IDLE);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      startTransition(async () => {
        const next = await fetchIntegrationActivity();
        if (cancelled) return;
        if ("error" in next) {
          setPollError(next.error);
          return;
        }
        setPollError(null);
        setSnapshot(next);
      });
    };
    tick();
    const id = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tools = snapshot?.tools ?? initial.mcp.tools;
  const calls = snapshot?.toolCalls ?? null;
  const runs = snapshot?.connectorRuns ?? [];
  const events = snapshot?.events ?? [];
  const mcpConfigured = snapshot?.mcpConfigured ?? initial.mcp.keyConfigured;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Connectors" description="Configured only when server env is set. Health is never claimed without a recorded poll.">
        <ul className="space-y-3" aria-label="Source connectors">
          {initial.connectors.map((c) => {
            const live = runs.find((r) => r.connectorId === c.id);
            const last = live
              ? {
                  status: live.status,
                  at: live.at,
                  signalsIngested: live.signalsIngested,
                  errorClass: live.errorClass,
                  httpStatusClass: live.httpStatusClass,
                }
              : c.lastRun;
            return (
              <li key={c.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.version}</p>
                  </div>
                  <Chip className={c.configured ? "border-border text-foreground" : "text-muted-foreground"}>
                    {c.configured ? "configured" : "not configured"}
                  </Chip>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-dense">
                  <dt className="text-muted-foreground">Last run</dt>
                  <dd className="font-mono text-xs">
                    {last ? `${last.status} · ${formatDateTime(last.at)}` : "none recorded"}
                  </dd>
                  {last ? (
                    <>
                      <dt className="text-muted-foreground">Signals ingested</dt>
                      <dd className="font-mono text-xs">{last.signalsIngested}</dd>
                      <dt className="text-muted-foreground">HTTP class</dt>
                      <dd className="font-mono text-xs">{last.httpStatusClass ?? "—"}</dd>
                      <dt className="text-muted-foreground">Error class</dt>
                      <dd className="font-mono text-xs">{last.errorClass ?? "—"}</dd>
                    </>
                  ) : null}
                </dl>
                <form action={connectorAction} className="mt-2">
                  <input type="hidden" name="connectorId" value={c.id} />
                  <SubmitButton
                    label="Run connector now"
                    disabled={!initial.canOperate || !c.configured}
                    reason={!c.configured ? "Connector is not configured." : initial.operateReason}
                  />
                </form>
              </li>
            );
          })}
        </ul>
        <ActionMessage state={connectorState} />
      </Panel>

      <Panel title="MCP" description="Read-only tools over stdio or authenticated HTTP. Tenant is always the server DEMO_TENANT_ID.">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-dense">
          <dt className="text-muted-foreground">MCP_API_KEY</dt>
          <dd>{mcpConfigured ? "configured" : "not configured"}</dd>
          <dt className="text-muted-foreground">HTTP</dt>
          <dd className="font-mono text-xs">POST /api/mcp</dd>
          <dt className="text-muted-foreground">Stdio</dt>
          <dd className="font-mono text-xs">npm run mcp</dd>
        </dl>
        <ul className="mt-3 space-y-1" aria-label="MCP tool catalog">
          {tools.length === 0 ? (
            <li className="text-dense text-text-tertiary">No tools registered.</li>
          ) : (
            tools.map((t) => (
              <li key={t.name} className="text-dense">
                <span className="font-mono text-xs">{t.name}</span>
                <span className="text-muted-foreground"> — {t.description}</span>
              </li>
            ))
          )}
        </ul>
        <form action={smokeAction} className="mt-3">
          <SubmitButton label="MCP smoke call" disabled={!initial.canOperate} reason={initial.operateReason} />
        </form>
        <ActionMessage state={smokeState} />
      </Panel>

      <Panel
        title="Integration activity"
        description="Persisted tool and connector events. Refreshes every 5 seconds. No fabricated progress."
        className="lg:col-span-2"
      >
        {pollError ? <p className="mb-2 text-dense text-destructive">{pollError}</p> : null}
        {events.length === 0 && (!calls || calls.length === 0) && initial.mcp.recentCalls.length === 0 ? (
          <p className="text-dense text-text-tertiary">No integration events recorded yet.</p>
        ) : (
          <ul className="space-y-2" aria-label="Recent integration activity">
            {events.slice(0, 15).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-dense">
                <Chip className={e.status === "failed" ? "border-destructive/40 text-destructive" : undefined}>{e.type}</Chip>
                <span className="font-mono text-xs text-muted-foreground">{formatDateTime(e.occurredAt)}</span>
                <span className="font-mono text-xs">{e.correlationId}</span>
                {typeof e.metadata.tool === "string" ? <span>{e.metadata.tool}</span> : null}
                {typeof e.metadata.connector === "string" ? <span>{e.metadata.connector}</span> : null}
              </li>
            ))}
            {events.length === 0
              ? (calls ?? initial.mcp.recentCalls).slice(0, 10).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-dense">
                    <Chip>{"toolName" in c ? c.toolName : (c as { toolName: string }).toolName}</Chip>
                    <span className="font-mono text-xs">{c.status}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatDateTime(c.at)}</span>
                  </li>
                ))
              : null}
          </ul>
        )}
        {snapshot?.asOf ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Polled {formatDateTime(snapshot.asOf)}</p>
        ) : null}
      </Panel>
    </div>
  );
}
