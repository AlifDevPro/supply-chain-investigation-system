import { Clock, DatabaseZap } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shows when the data was captured and where it came from. Staleness is decided by the data source
 * (`stale`), never guessed from the browser clock. A stale state is text plus icon, not color alone.
 */
export function FreshnessIndicator({
  asOf,
  source,
  stale = false,
  className,
}: {
  asOf: string;
  source: string;
  stale?: boolean;
  className?: string;
}) {
  const Icon = stale ? Clock : DatabaseZap;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        stale ? "font-medium text-status-stale" : "text-muted-foreground",
        className,
      )}
      data-stale={stale ? "true" : "false"}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>
        {stale ? "Stale · " : ""}
        <span className="sr-only">Data captured </span>
        <time dateTime={asOf} className="font-mono">
          {formatDateTime(asOf)}
        </time>
        <span className="hidden sm:inline"> · {source}</span>
      </span>
    </span>
  );
}
