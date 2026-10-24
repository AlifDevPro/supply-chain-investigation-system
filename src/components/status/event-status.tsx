import { CircleCheck, CircleMinus, CircleX, Hourglass, RotateCw, type LucideIcon } from "lucide-react";
import type { EventStatus as Status } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const EVENT_STATUS_CONFIG: Record<Status, { label: string; Icon: LucideIcon; text: string }> = {
  completed: { label: "Completed", Icon: CircleCheck, text: "text-status-verified" },
  failed: { label: "Failed", Icon: CircleX, text: "text-status-conflicted" },
  retrying: { label: "Retrying", Icon: RotateCw, text: "text-status-stale" },
  waiting: { label: "Awaiting review", Icon: Hourglass, text: "text-primary" },
  skipped: { label: "Skipped", Icon: CircleMinus, text: "text-text-tertiary" },
};

/** Icon plus text. The status word is always rendered. */
export function EventStatus({ status, className }: { status: Status; className?: string }) {
  const { label, Icon, text } = EVENT_STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-dense", className)} data-event-status={status}>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", text)} />
      <span>{label}</span>
    </span>
  );
}
