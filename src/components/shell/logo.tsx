import { cn } from "@/lib/utils";

/** Simple geometric node-chain mark: supplier, material, order. Uses currentColor tokens only. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 shrink-0", className)} fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" className="fill-primary" />
      <path d="M6.5 15.5 L12 8.5 L17.5 15.5" className="stroke-primary-foreground" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="6.5" cy="15.5" r="1.9" className="fill-primary-foreground" />
      <circle cx="12" cy="8.5" r="1.9" className="fill-primary-foreground" />
      <circle cx="17.5" cy="15.5" r="1.9" className="fill-primary-foreground" />
    </svg>
  );
}
