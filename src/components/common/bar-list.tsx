import { cn } from "@/lib/utils";

const SEGMENT = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-border-strong", "bg-muted-foreground/50", "bg-text-tertiary/40", "bg-border"];

/** Accessible bar list: the decorative bar is hidden from AT; the list carries labels and counts. */
export function BarList({
  rows,
  label,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
  label: string;
}) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (total === 0) {
    return <p className="text-dense text-text-tertiary">No values in this window.</p>;
  }
  return (
    <div className="space-y-3">
      <div aria-hidden="true" className="flex h-3 w-full gap-px overflow-hidden rounded-sm bg-card">
        {rows.map((r, i) => (
          <span key={r.key} className={cn("h-full", SEGMENT[i % SEGMENT.length])} style={{ width: `${(r.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="space-y-1.5" aria-label={label}>
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 text-dense">
            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[2px]", SEGMENT[i % SEGMENT.length])} />
            <span className="flex-1 text-foreground">{r.label}</span>
            <span className="font-mono tabular-nums">{r.count}</span>
            <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {Math.round((r.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
