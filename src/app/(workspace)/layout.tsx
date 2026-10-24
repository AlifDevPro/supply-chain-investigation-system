import { redirect } from "next/navigation";
import { AppShell, type ShellIdentity } from "@/components/shell/app-shell";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { readSession } from "@/lib/auth/session";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const identity: ShellIdentity = {
    displayName: session.displayName,
    email: session.email,
    roleLabel: ROLE_LABEL[session.role],
  };
  return <AppShell identity={identity}>{children}</AppShell>;
}
