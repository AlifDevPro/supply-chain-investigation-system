import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Eye,
  Hourglass,
  Inbox,
  Loader,
  Play,
  SearchCheck,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CaseState } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";

const NEUTRAL = "border-border-strong bg-card text-foreground";
const REVIEW = "border-primary/50 bg-primary-subtle text-primary-subtle-foreground";
const GOOD = "border-status-verified/50 bg-status-verified-bg text-status-verified";
const BAD = "border-status-conflicted/50 bg-status-conflicted-bg text-status-conflicted";
const WAIT = "border-status-stale/50 bg-status-stale-bg text-status-stale";

export const CASE_STATE_CONFIG: Record<CaseState, { label: string; Icon: LucideIcon; className: string }> = {
  received: { label: "Received", Icon: Inbox, className: NEUTRAL },
  triaging: { label: "Triaging", Icon: Loader, className: NEUTRAL },
  investigating: { label: "Investigating", Icon: SearchCheck, className: NEUTRAL },
  needs_review: { label: "Needs review", Icon: Eye, className: REVIEW },
  awaiting_approval: { label: "Awaiting approval", Icon: Hourglass, className: REVIEW },
  approved: { label: "Approved", Icon: ShieldCheck, className: GOOD },
  executing: { label: "Executing", Icon: Play, className: NEUTRAL },
  awaiting_verification: { label: "Awaiting verification", Icon: CircleDashed, className: WAIT },
  resolved: { label: "Resolved", Icon: CircleCheck, className: GOOD },
  rejected: { label: "Rejected", Icon: X, className: BAD },
  dismissed: { label: "Dismissed", Icon: X, className: NEUTRAL },
  failed: { label: "Failed", Icon: CircleX, className: BAD },
  cancelled: { label: "Cancelled", Icon: X, className: NEUTRAL },
  blocked: { label: "Blocked", Icon: Ban, className: BAD },
};

export function CaseStateBadge({ state, className }: { state: CaseState; className?: string }) {
  const { label, Icon, className: tone } = CASE_STATE_CONFIG[state];
  return (
    <Chip className={cn(tone, className)} data-case-state={state}>
      <Icon aria-hidden="true" />
      {label}
    </Chip>
  );
}
