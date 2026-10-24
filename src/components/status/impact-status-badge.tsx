import { CircleCheck, CircleDotDashed, CircleQuestionMark, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";

export type ImpactStatus = "verified" | "provisional" | "incalculable" | "none";

const CONFIG: Record<Exclude<ImpactStatus, "none">, { label: string; Icon: LucideIcon; className: string; title: string }> = {
  verified: {
    label: "Verified",
    Icon: CircleCheck,
    className: "border-status-verified/50 bg-status-verified-bg text-status-verified",
    title: "Every input is verified. The calculation is confirmed.",
  },
  provisional: {
    label: "Provisional",
    Icon: CircleDotDashed,
    className: "border-dashed border-status-stale/70 bg-status-stale-bg text-status-stale",
    title: "Calculated from unverified inputs or with explicit assumptions. Not a confirmed figure.",
  },
  incalculable: {
    label: "Not calculable",
    Icon: CircleQuestionMark,
    className: "border-dotted border-border-strong bg-status-unknown-bg text-status-unknown",
    title: "Required inputs are missing, so no figure is shown.",
  },
};

/** Verification status of an impact calculation. Provisional is never styled like verified. */
export function ImpactStatusBadge({ status, className }: { status: ImpactStatus; className?: string }) {
  if (status === "none") return <span className={cn("text-xs text-text-tertiary", className)}>No impact quantified</span>;
  const { label, Icon, className: tone, title } = CONFIG[status];
  return (
    <Chip className={cn(tone, className)} title={title} data-impact-status={status}>
      <Icon aria-hidden="true" />
      {label}
    </Chip>
  );
}
