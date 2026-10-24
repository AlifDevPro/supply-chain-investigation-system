import { cn } from "@/lib/utils";

/** Shared chip base. All status components (claim, case state, event status) build on this. */
export function Chip({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
