"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Monospace identifier with an optional copy control. Copy feedback is announced politely. */
export function MonoId({
  value,
  copyable = false,
  className,
}: {
  value: string;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!copyable) {
    return <span className={cn("font-mono text-xs tabular-nums", className)}>{value}</span>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono text-xs tabular-nums">{value}</span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex size-5 items-center justify-center rounded-sm text-text-tertiary hover:bg-accent hover:text-foreground"
        aria-label={`Copy ${value}`}
      >
        {copied ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? `${value} copied` : ""}
      </span>
    </span>
  );
}
