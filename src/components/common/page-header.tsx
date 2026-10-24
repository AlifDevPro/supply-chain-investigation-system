import { cn } from "@/lib/utils";

/** Page title block. The serif title is the one editorial element in the system. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <div className="text-xs font-medium tracking-wide text-text-tertiary uppercase">{eyebrow}</div>
        ) : null}
        <h1 className="font-serif text-title font-semibold text-balance text-foreground">{title}</h1>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
