import { Database, History, Radio, RefreshCw, Unplug, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnectionState = "replay" | "snapshot" | "connected" | "reconnecting" | "stale" | "disconnected";

const CONFIG: Record<ConnectionState, { label: string; Icon: LucideIcon; className: string }> = {
  replay: { label: "Recorded replay", Icon: History, className: "border-dashed border-border-strong bg-surface-sunken text-foreground" },
  snapshot: { label: "Persisted snapshot", Icon: Database, className: "border-border-strong bg-card text-foreground" },
  connected: { label: "Connected", Icon: Radio, className: "border-status-verified/50 bg-status-verified-bg text-status-verified" },
  reconnecting: { label: "Reconnecting", Icon: RefreshCw, className: "border-status-stale/50 bg-status-stale-bg text-status-stale" },
  stale: { label: "Stale", Icon: Clock, className: "border-status-stale/50 bg-status-stale-bg text-status-stale" },
  disconnected: { label: "Disconnected", Icon: Unplug, className: "border-status-conflicted/50 bg-status-conflicted-bg text-status-conflicted" },
};

/**
 * Stream connection state, separate from event status. There is no live stream yet: fixtures render
 * `replay`, persisted data renders `snapshot` (read once at page load). The other states exist for the SSE
 * phase and are covered by tests.
 */
export function ConnectionStatus({
  state,
  detail,
  className,
}: {
  state: ConnectionState;
  detail?: string;
  className?: string;
}) {
  const { label, Icon, className: tone } = CONFIG[state];
  return (
    <span
      role="status"
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium whitespace-nowrap", tone, className)}
      data-connection-state={state}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
      {detail ? <span className="font-normal opacity-90">· {detail}</span> : null}
    </span>
  );
}
