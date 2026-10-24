"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { FlaskConical, UserRound } from "lucide-react";
import { LogoMark } from "./logo";
import { NAV_GROUPS, isActivePath, type NavItem } from "./nav-config";

/** Collapses to the icon rail between 1024px and 1279px, once, on load. The user can re-expand. */
function AutoCollapseOnMidWidth() {
  const { setOpen, isMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) return;
    const w = window.innerWidth;
    if (w >= 768 && w < 1280) setOpen(false);
  }, [isMobile, setOpen]);
  return null;
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const { Icon } = item;
  if (!item.href) {
    // Planned route: focusable, announced as disabled, no navigation.
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled="true"
          tooltip={`${item.label} · ${item.planned}`}
          className="cursor-not-allowed text-text-tertiary hover:bg-transparent hover:text-text-tertiary aria-disabled:pointer-events-auto aria-disabled:opacity-100"
          onClick={(e) => e.preventDefault()}
        >
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
          <span aria-hidden="true" className="ml-auto rounded-sm border border-border-strong px-1 text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-text-tertiary group-data-[collapsible=icon]:hidden">
            {item.planned}
          </span>
          <span className="sr-only">Planned, {item.planned}. Not available yet.</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  const active = isActivePath(pathname, item.href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className="data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-primary)]"
      >
        <Link href={item.href} aria-current={active ? "page" : undefined}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon" aria-label="Primary">
      <AutoCollapseOnMidWidth />
      <SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md outline-offset-2 group-data-[collapsible=icon]:justify-center"
          aria-label="Supply Chain Investigation, Overview"
        >
          <LogoMark />
          <span className="text-sm leading-tight font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Supply Chain
            <br />
            Investigation
          </span>
        </Link>
        <div className="flex items-start gap-2 rounded-md border border-sidebar-border bg-card px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden">
          <FlaskConical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">Demo tenant</div>
            <div className="truncate text-muted-foreground">Synthetic data only</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="px-2 py-1">
            <SidebarGroupLabel className="h-6 text-xs font-medium tracking-wide text-text-tertiary uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavRow key={item.label} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-muted-foreground"
          >
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 text-xs group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-foreground">Demo reviewer</div>
            <div className="truncate text-muted-foreground">Supply-chain manager · no sign-in</div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
