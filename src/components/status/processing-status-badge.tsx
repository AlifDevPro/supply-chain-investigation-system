import { Ban, Check, CopyCheck, Hourglass, Pencil, ShieldAlert } from "lucide-react";
import type { DedupeStatus, ProcessingStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";

/**
 * How a submitted signal was handled. Always text plus icon (never color alone). `held_for_review` means a
 * human decision is pending; it is not an error.
 */
const CONFIG: Record<ProcessingStatus, { label: string; Icon: typeof Ban; className: string }> = {
  rejected: { label: "Rejected: invalid input", Icon: ShieldAlert, className: "border-status-conflicted/50 bg-status-conflicted-bg text-status-conflicted" },
  duplicate: { label: "Duplicate", Icon: CopyCheck, className: "border-dashed border-border-strong bg-surface-sunken text-muted-foreground" },
  triaged: { label: "Triaged", Icon: Check, className: "border-border bg-card text-muted-foreground" },
  held_for_review: { label: "Held for review", Icon: Hourglass, className: "border-dashed border-status-stale/70 bg-status-stale-bg text-status-stale" },
};

export function ProcessingStatusBadge({ status, className }: { status: ProcessingStatus; className?: string }) {
  const { label, Icon, className: tone } = CONFIG[status];
  return (
    <Chip className={cn(tone, className)} data-processing-status={status}>
      <Icon aria-hidden="true" />
      {label}
    </Chip>
  );
}

export function RevisionBadge({ dedupe, className }: { dedupe: DedupeStatus | null; className?: string }) {
  if (dedupe !== "revision") return null;
  return (
    <Chip className={cn("border-status-conflicted/50 bg-status-conflicted-bg text-status-conflicted", className)}>
      <Pencil aria-hidden="true" />
      Revision
    </Chip>
  );
}
