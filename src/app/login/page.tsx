import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { googleConfigured } from "@/lib/auth/google-oauth";
import { safeNext } from "@/lib/auth/safe-next";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in could not be completed. Try again, or use email.",
  google_unconfigured: "Google sign-in is not configured on this server.",
  google_limited: "Too many Google sign-in attempts. Wait a minute and try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await readSession();
  const next = safeNext(params.next);
  if (session) redirect(next);
  const errorKey = typeof params.error === "string" ? params.error : "";
  const googleError = GOOGLE_ERRORS[errorKey] ?? null;
  return (
    <AuthFrame
      title="Sign in"
      description="A signed-in role is required to review cases and approve proposed actions. The ingest API is separate and uses its own key."
    >
      <div className="space-y-4">
        <GoogleSignIn next={next} configured={googleConfigured(getEnv())} label="Sign in with Google" />
        <p className="text-center text-xs text-muted-foreground">or use email</p>
        <LoginForm next={next} />
        {googleError ? <p className="text-sm text-status-conflicted">{googleError}</p> : null}
        <p className="text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-primary underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
