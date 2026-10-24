import type { TriageOutcome } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";

export const TRIAGE_LABEL: Record<TriageOutcome, string> = {
  irrelevant: "Irrelevant",
  relevant: "Relevant",
  uncertain: "Uncertain, kept for review",
  related_existing: "Related to open case",
  high_impact: "High impact",
};

const TONE: Record<TriageOutcome, string> = {
  irrelevant: "border-border bg-card text-muted-foreground",
  relevant: "border-border-strong bg-card text-foreground",
  uncertain: "border-dashed border-status-stale/70 bg-status-stale-bg text-status-stale",
  related_existing: "border-border-strong bg-primary-subtle text-primary-subtle-foreground",
  high_impact: "border-status-conflicted/50 bg-status-conflicted-bg text-status-conflicted",
};

export function TriageOutcomeBadge({ outcome, className }: { outcome: TriageOutcome; className?: string }) {
  return <Chip className={cn(TONE[outcome], className)}>{TRIAGE_LABEL[outcome]}</Chip>;
}
