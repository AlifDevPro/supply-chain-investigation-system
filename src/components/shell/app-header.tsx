"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { UserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DataModeBadge } from "@/components/provenance/data-mode-badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { breadcrumbsFor } from "./nav-config";
import type { ShellIdentity } from "./app-shell";

export function AppHeader({ identity }: { identity: ShellIdentity }) {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      <SidebarTrigger className="-ml-1 size-8" aria-label="Toggle navigation" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                <BreadcrumbItem className={last ? "min-w-0" : "hidden min-w-0 sm:inline-flex"}>
                  {last || !c.href ? (
                    <BreadcrumbPage className="truncate font-mono text-dense font-medium sm:font-sans sm:text-sm">
                      {c.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {last ? null : <BreadcrumbSeparator className="hidden sm:block" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <DataModeBadge />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Account menu">
            <UserRound aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <div className="text-sm font-medium">{identity.displayName}</div>
            <div className="text-xs text-muted-foreground">Role: {identity.roleLabel}</div>
            <div className="text-xs text-muted-foreground">{identity.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <form action={logout}>
              <button type="submit" className="w-full text-left">
                Sign out
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
