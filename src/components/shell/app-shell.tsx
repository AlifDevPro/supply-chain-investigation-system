import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export type ShellIdentity = {
  displayName: string;
  email: string;
  roleLabel: string;
};

/**
 * Application frame: skip link, sidebar, sticky header and the main landmark.
 * Pages render inside <main id="main-content">.
 */
export function AppShell({ children, identity }: { children: React.ReactNode; identity: ShellIdentity }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "15.5rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader identity={identity} />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 outline-none sm:px-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
