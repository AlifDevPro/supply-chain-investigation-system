import { Button } from "@/components/ui/button";

export function GoogleSignIn({ next, configured, label }: { next: string; configured: boolean; label: string }) {
  if (!configured) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full" disabled aria-describedby="google-disabled">
          {label}
        </Button>
        <p id="google-disabled" className="text-xs text-muted-foreground">
          Disabled: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable Google. The secret is not shown here.
        </p>
      </div>
    );
  }
  const href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  return (
    <Button variant="outline" className="w-full" asChild>
      <a href={href}>{label}</a>
    </Button>
  );
}
