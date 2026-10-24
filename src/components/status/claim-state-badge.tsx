import {
  Clock,
  CircleCheck,
  CircleDotDashed,
  CircleQuestionMark,
  GitBranch,
  Quote,
  Split,
  type LucideIcon,
} from "lucide-react";
import type { ClaimState } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";

/**
 * Claim / verification state. Never relies on color alone: every state has a distinct icon,
 * a text label and its own border style (solid, dashed, dotted, thick).
 */
export const CLAIM_STATE_CONFIG: Record<ClaimState, { label: string; Icon: LucideIcon; className: string; description: string }> = {
  verified: {
    label: "Verified",
    Icon: CircleCheck,
    className: "border-status-verified/50 bg-status-verified-bg text-status-verified",
    description: "Supported by authoritative evidence or a completed verification.",
  },
  reported: {
    label: "Reported",
    Icon: Quote,
    className: "border-border-strong bg-status-reported-bg text-status-reported",
    description: "Stated by a source but not independently confirmed.",
  },
  inferred: {
    label: "Inferred",
    Icon: GitBranch,
    className: "border-dashed border-status-inferred/60 bg-status-inferred-bg text-status-inferred",
    description: "Derived from evidence through a documented inference.",
  },
  assumed: {
    label: "Assumed",
    Icon: CircleDotDashed,
    className: "border-dotted border-status-assumed/70 bg-status-assumed-bg text-status-assumed",
    description: "Temporarily accepted for analysis; not verified.",
  },
  unknown: {
    label: "Unknown",
    Icon: CircleQuestionMark,
    className: "border-dotted border-border-strong bg-status-unknown-bg text-status-unknown",
    description: "Required information is unavailable.",
  },
  conflicted: {
    label: "Conflicted",
    Icon: Split,
    className: "border-2 border-status-conflicted/60 bg-status-conflicted-bg text-status-conflicted",
    description: "Relevant sources disagree.",
  },
  stale: {
    label: "Stale",
    Icon: Clock,
    className: "border-status-stale/50 bg-status-stale-bg text-status-stale",
    description: "May no longer reflect current conditions.",
  },
};

export const CLAIM_STATE_LABEL: Record<ClaimState, string> = Object.fromEntries(
  Object.entries(CLAIM_STATE_CONFIG).map(([k, v]) => [k, v.label]),
) as Record<ClaimState, string>;

export const CLAIM_STATE_DESCRIPTION: Record<ClaimState, string> = Object.fromEntries(
  Object.entries(CLAIM_STATE_CONFIG).map(([k, v]) => [k, v.description]),
) as Record<ClaimState, string>;

export function ClaimStateBadge({ state, className }: { state: ClaimState; className?: string }) {
  const { label, Icon, className: tone, description } = CLAIM_STATE_CONFIG[state];
  return (
    <Chip className={cn(tone, className)} title={description} data-claim-state={state}>
      <Icon aria-hidden="true" />
      {label}
    </Chip>
  );
}
