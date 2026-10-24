import type { ReactNode } from "react";
import { DataModeBadge } from "@/components/provenance/data-mode-badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-end gap-2 border-b px-4 py-3">
        <DataModeBadge />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Supply Chain Investigation</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-dense text-muted-foreground">{description}</p>
        <div className="mt-6 rounded-md border bg-card p-5">{children}</div>
      </main>
    </div>
  );
}
