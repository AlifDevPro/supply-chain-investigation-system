import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Bordered content region with a heading. Elevation comes from the border, not a shadow.
 * Renders a labelled <section> so screen-reader users can navigate by landmark/heading.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  headingLevel = 2,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const autoId = useId();
  const headingId = `${id ?? autoId}-title`;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={headingId} className={cn("min-w-0 rounded-md border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <div className="min-w-0">
          <Heading id={headingId} className="text-base font-semibold text-foreground">
            {title}
          </Heading>
          {description ? <p className="mt-0.5 text-dense text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
