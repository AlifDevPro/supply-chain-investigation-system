import { CASE_STATE_CONFIG } from "@/components/status/case-state-badge";
import type { CaseState } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Case count by lifecycle state. A single stacked bar gives the shape at a glance (decorative); the list
 * beneath carries the exact label, count and share, so nothing depends on color or on seeing the bar.
 * Plain CSS, no chart dependency.
 */
const SEGMENT = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-border-strong", "bg-muted-foreground/50", "bg-text-tertiary/40", "bg-border"];

export function StageDistribution({ rows }: { rows: Array<{ state: CaseState; count: number }> }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-3">
      <div aria-hidden="true" className="flex h-3 w-full gap-px overflow-hidden rounded-sm bg-card">
        {rows.map((r, i) => (
          <span key={r.state} className={cn("h-full", SEGMENT[i % SEGMENT.length])} style={{ width: `${(r.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="space-y-1.5" aria-label="Cases by lifecycle state">
        {rows.map((r, i) => {
          const { label, Icon } = CASE_STATE_CONFIG[r.state];
          return (
            <li key={r.state} className="flex items-center gap-2 text-dense">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[2px]", SEGMENT[i % SEGMENT.length])} />
              <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-foreground">{label}</span>
              <span className="font-mono tabular-nums">{r.count}</span>
              <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {Math.round((r.count / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
