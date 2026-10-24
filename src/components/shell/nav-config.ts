import {
  Activity,
  ChartColumn,
  ClipboardCheck,
  FileSearch,
  LayoutDashboard,
  Network,
  Plug,
  ScrollText,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  Icon: LucideIcon;
  /** Present only for routes that exist. Planned routes have no href and render as disabled rows. */
  href?: string;
  /** Roadmap phase (or "Unscheduled") shown for planned items. */
  planned?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation from README 11.1. Every primary route is a real page.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { label: "Overview", Icon: LayoutDashboard, href: "/" },
      { label: "Live Activity", Icon: Activity, href: "/live-activity" },
      { label: "Investigations", Icon: Search, href: "/investigations" },
      { label: "Review Queue", Icon: ClipboardCheck, href: "/review" },
    ],
  },
  {
    label: "Explore",
    items: [
      { label: "Evidence Explorer", Icon: FileSearch, href: "/evidence" },
      { label: "Supply Chain Graph", Icon: Network, href: "/graph" },
      { label: "Reports & Analytics", Icon: ChartColumn, href: "/reports" },
    ],
  },
  {
    label: "Govern",
    items: [
      { label: "Integrations", Icon: Plug, href: "/integrations" },
      { label: "Audit & Security", Icon: ScrollText, href: "/audit" },
      { label: "Settings", Icon: Settings, href: "/settings" },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type Crumb = { label: string; href?: string };

export function breadcrumbsFor(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Overview" }];
  if (pathname === "/live-activity") return [{ label: "Live Activity" }];
  if (pathname === "/investigations") return [{ label: "Investigations" }];
  if (pathname === "/review") return [{ label: "Review Queue" }];
  if (pathname === "/evidence") return [{ label: "Evidence Explorer" }];
  if (pathname === "/graph") return [{ label: "Supply Chain Graph" }];
  if (pathname === "/reports") return [{ label: "Reports & Analytics" }];
  if (pathname === "/integrations") return [{ label: "Integrations" }];
  if (pathname === "/audit") return [{ label: "Audit & Security" }];
  if (pathname === "/settings") return [{ label: "Settings" }];
  const m = /^\/investigations\/([^/]+)$/.exec(pathname);
  if (m?.[1]) return [{ label: "Investigations", href: "/investigations" }, { label: decodeURIComponent(m[1]) }];
  return [{ label: "Not found" }];
}
