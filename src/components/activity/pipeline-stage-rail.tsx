import { EVENT_STATUS_CONFIG } from "@/components/status/event-status";
import type { StageSummary } from "@/lib/derive";
import { EVENT_STATUSES_DISPLAY } from "@/lib/derive/stage-display";
import { STAGES, STAGE_LABELS } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * The workflow stages with counts taken from recorded events. A stage nobody reached says
 * "No events"; the rail never implies progress that was not recorded. It has no animation.
 */
export function PipelineStageRail({ summary }: { summary: StageSummary }) {
  return (
    <ol aria-label="Pipeline stages" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {STAGES.map((stage, i) => {
        const counts = summary[stage];
        const total = EVENT_STATUSES_DISPLAY.reduce((n, s) => n + counts[s], 0);
        return (
          <li key={stage} className="flex min-h-24 flex-col gap-2 bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                <span className="mr-1.5 font-mono text-text-tertiary" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {STAGE_LABELS[stage]}
              </span>
              <span className="font-mono text-dense tabular-nums text-muted-foreground">
                <span className="sr-only">Flows recorded: </span>
                {total}
              </span>
            </div>
            {total === 0 ? (
              <p className="text-xs text-text-tertiary">No events</p>
            ) : (
              <ul className="space-y-0.5">
                {EVENT_STATUSES_DISPLAY.filter((s) => counts[s] > 0).map((s) => {
                  const { Icon, label, text } = EVENT_STATUS_CONFIG[s];
                  return (
                    <li key={s} className="flex items-center gap-1.5 text-xs">
                      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", text)} />
                      <span className="font-mono tabular-nums">{counts[s]}</span>
                      <span className="text-muted-foreground">{label.toLowerCase()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
