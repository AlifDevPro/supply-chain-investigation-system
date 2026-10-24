import Link from "next/link";
import { EmptyState } from "@/components/states/state-views";
import { EventStatus } from "@/components/status/event-status";
import type { InvestigationEvent } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

/** Short excerpt of recent important events; the full stream lives in Live Activity. */
export function RecentEvents({ events }: { events: InvestigationEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No important events">No failed, waiting or case-level events are recorded in this view.</EmptyState>;
  }
  return (
    <ul className="divide-y">
      {events.map((e) => (
        <li key={e.id} className="grid gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[10.5rem_minmax(0,1fr)_auto] sm:items-center">
          <time dateTime={e.occurredAt} className="font-mono text-xs text-muted-foreground">
            {formatDateTime(e.occurredAt)}
          </time>
          <div className="min-w-0 text-dense">
            <span className="font-mono text-xs text-foreground">{e.type}</span>
            {e.caseId ? (
              <>
                <span className="text-text-tertiary"> · </span>
                <Link href={`/investigations/${e.caseId}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                  {e.caseId}
                </Link>
              </>
            ) : e.signalId ? (
              <span className="font-mono text-xs text-text-tertiary"> · {e.signalId}</span>
            ) : null}
          </div>
          <EventStatus status={e.status} />
        </li>
      ))}
    </ul>
  );
}
