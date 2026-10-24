import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { googleConfigured } from "@/lib/auth/google-oauth";
import { safeNext } from "@/lib/auth/safe-next";
import { readSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await readSession();
  const next = safeNext((await searchParams).next);
  if (session) redirect(next);
  return (
    <AuthFrame
      title="Create an account"
      description="A new account is a reviewer on this tenant. It can record review decisions. It cannot approve procurement actions or verify outcomes until a manager role is assigned."
    >
      <div className="space-y-4">
        <GoogleSignIn next={next} configured={googleConfigured(getEnv())} label="Sign up with Google" />
        <p className="text-center text-xs text-muted-foreground">or create one with email</p>
        <SignupForm next={next} />
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
