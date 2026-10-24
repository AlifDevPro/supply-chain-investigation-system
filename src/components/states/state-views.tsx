import { Clock, Inbox, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function StateFrame({
  Icon,
  title,
  children,
  actions,
  tone = "neutral",
  role,
  className,
}: {
  Icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "neutral" | "danger";
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-dashed bg-card p-6 sm:flex-row sm:items-center",
        tone === "danger" ? "border-status-conflicted/50" : "border-border-strong",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          tone === "danger" ? "bg-status-conflicted-bg text-status-conflicted" : "bg-surface-sunken text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {children ? <div className="text-dense text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  actions,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateFrame Icon={Inbox} title={title} actions={actions} className={className}>
      {children}
    </StateFrame>
  );
}

export function ErrorState({
  title = "This data could not be loaded",
  children,
  actions,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateFrame Icon={TriangleAlert} title={title} tone="danger" role="alert" actions={actions} className={className}>
      {children ?? "The source did not return a response. Nothing is shown rather than showing stale or partial values as current."}
    </StateFrame>
  );
}

export function PermissionDeniedState({
  title = "You do not have access to this data",
  children,
  actions,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateFrame Icon={Lock} title={title} role="alert" actions={actions} className={className}>
      {children ?? "Your role or tenant scope does not include this record. Access is enforced by the backend, not by hiding this page."}
    </StateFrame>
  );
}

export function StaleDataBanner({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border border-status-stale/50 bg-status-stale-bg px-3 py-2 text-dense text-status-stale",
        className,
      )}
    >
      <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Stale data.</strong>{" "}
        {children ?? "This view may not reflect current conditions. Treat values as of their capture time."}
      </p>
    </div>
  );
}

/** Skeleton for tables and lists. Announced as busy; no shimmer animation. */
export function LoadingState({ label = "Loading", rows = 6, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-8 w-48 animate-none" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full animate-none" />
      ))}
    </div>
  );
}
