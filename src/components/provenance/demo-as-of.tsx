import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Small "as of" footer used under metrics. */
export function DemoAsOf({ asOf, className }: { asOf: string; className?: string }) {
  return (
    <p className={cn("text-xs text-text-tertiary", className)}>
      As of <time dateTime={asOf}>{formatDateTime(asOf)}</time> · synthetic
    </p>
  );
}
