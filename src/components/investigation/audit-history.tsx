import type { AuditEntry } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

/** Readable audit history: who or what did what, and when. */
export function AuditHistory({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-dense text-muted-foreground">No audit entries are recorded for this case in the synthetic dataset.</p>;
  }
  return (
    <ol aria-label="Audit history" className="space-y-3">
      {entries.map((a) => (
        <li key={a.id} className="border-b pb-3 text-dense last:border-b-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium text-foreground">{a.action}</span>
            <time dateTime={a.at} className="font-mono text-xs text-muted-foreground">
              {formatDateTime(a.at)}
            </time>
          </div>
          <div className="text-xs text-muted-foreground">{a.actor}</div>
          <p className="mt-0.5 text-muted-foreground">{a.detail}</p>
        </li>
      ))}
    </ol>
  );
}
