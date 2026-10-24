import type { Severity } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Severity as a 4-segment glyph plus a text label. The number of filled segments and the label carry
 * the meaning; color only reinforces it.
 */
const CONFIG: Record<Severity, { label: string; filled: number; fill: string; text: string }> = {
  critical: { label: "Critical", filled: 4, fill: "bg-sev-critical", text: "text-foreground font-semibold" },
  high: { label: "High", filled: 3, fill: "bg-sev-high", text: "text-foreground font-medium" },
  medium: { label: "Medium", filled: 2, fill: "bg-sev-medium", text: "text-foreground" },
  low: { label: "Low", filled: 1, fill: "bg-sev-low", text: "text-muted-foreground" },
};

export function SeverityIndicator({
  severity,
  className,
  showLabel = true,
}: {
  severity: Severity;
  className?: string;
  showLabel?: boolean;
}) {
  const { label, filled, fill, text } = CONFIG[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-dense", text, className)} data-severity={severity}>
      <span aria-hidden="true" className="flex items-end gap-px">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-[1px]", i < filled ? fill : "bg-border-strong/60")}
            style={{ height: 6 + i * 3 }}
          />
        ))}
      </span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label} severity</span>}
    </span>
  );
}
