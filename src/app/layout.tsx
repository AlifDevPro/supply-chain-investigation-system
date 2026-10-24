import type { Metadata } from "next";
import { plexMono, plexSans, sourceSerif } from "./fonts";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Supply Chain Investigation",
    template: "%s | Supply Chain Investigation",
  },
  description:
    "Evidence-driven supply-chain investigation workspace. Phase 1 runs on clearly labeled synthetic data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}
    >
      {/* Browser extensions (e.g. ColorZilla, Grammarly) add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
