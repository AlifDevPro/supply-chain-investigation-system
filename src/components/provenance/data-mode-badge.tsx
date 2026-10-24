import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Always-visible label for synthetic data. Phase 1 contains no operational data; this badge says so
 * wherever it is rendered.
 */
export function DataModeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border border-dashed border-border-strong bg-surface-sunken px-2 text-xs font-medium text-foreground",
        className,
      )}
      data-testid="data-mode-badge"
    >
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" />
      <span>
        Demo data<span className="hidden lg:inline"> · synthetic</span>
      </span>
    </span>
  );
}

/** Banner used at the top of pages that present synthetic values. Not dismissible by design. */
export function DemoDataNotice({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface-sunken px-3 py-2 text-dense text-foreground",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Synthetic demo data.</strong>{" "}
        {children ?? "Every value on this page is invented for development. Nothing here describes a real factory, supplier or order."}
      </p>
    </div>
  );
}
