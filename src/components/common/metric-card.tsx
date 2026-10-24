"use client";

import { Info } from "lucide-react";
import { DemoAsOf } from "@/components/provenance/demo-as-of";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type MetricDefinition = {
  /** How the number is calculated. */
  formula: string;
  /** Where the underlying records come from. */
  source: string;
  /** Time window or snapshot semantics. */
  window: string;
};

/**
 * KPI tile. A number is never shown without: a verification qualifier, its definition (formula, source,
 * window) and the time it was captured. The definition opens with a click or key press (not hover), so it
 * also works on touch screens.
 */
export function MetricCard({
  label,
  value,
  qualifier,
  definition,
  asOf,
  tone = "default",
  className,
}: {
  label: string;
  value: number | string;
  /** e.g. "1 verified · 2 provisional". Required so a figure cannot imply certainty. */
  qualifier: string;
  definition: MetricDefinition;
  asOf: string;
  tone?: "default" | "attention";
  className?: string;
}) {
  return (
    <Collapsible
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border bg-card p-4",
        tone === "attention" && "border-primary/40 bg-primary-subtle/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-dense font-medium text-muted-foreground">{label}</h3>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`How "${label}" is calculated`}
            className="inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </CollapsibleTrigger>
      </div>
      <p className="font-mono text-kpi font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-dense text-foreground">{qualifier}</p>
      <DemoAsOf asOf={asOf} className="mt-auto" />
      <CollapsibleContent className="space-y-1 rounded-sm border bg-surface-sunken p-2.5 text-xs text-foreground">
        <p>
          <span className="font-semibold">Formula: </span>
          {definition.formula}
        </p>
        <p>
          <span className="font-semibold">Source: </span>
          {definition.source}
        </p>
        <p>
          <span className="font-semibold">Window: </span>
          {definition.window}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
