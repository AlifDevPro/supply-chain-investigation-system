import { EventStatus } from "@/components/status/event-status";
import { sortEventsOldestFirst } from "@/lib/derive";
import type { InvestigationEvent } from "@/lib/domain";
import { formatDateTime, formatDuration } from "@/lib/format";

/** Recorded events for this case in time order. Durations are shown only when measured. */
export function CaseTimeline({ events }: { events: InvestigationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-dense text-muted-foreground">No events are recorded for this case.</p>;
  }
  return (
    <ol aria-label="Recorded events" className="relative ml-1.5 space-y-3 border-l border-border-strong pl-4">
      {sortEventsOldestFirst(events).map((e) => (
        <li key={e.id} className="relative text-dense">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.3125rem] size-2.5 rounded-full border-2 border-primary bg-card" />
          <time dateTime={e.occurredAt} className="font-mono text-xs text-muted-foreground">
            {formatDateTime(e.occurredAt)}
          </time>
          <div className="font-mono text-xs text-foreground">{e.type}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <EventStatus status={e.status} className="text-xs" />
            <span>{formatDuration(e.durationMs)}</span>
            {e.retryCount > 0 ? <span>{e.retryCount} retr{e.retryCount === 1 ? "y" : "ies"}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
