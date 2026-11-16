import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <AppShell email={session.user.email ?? ""} signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
      {children}
    </AppShell>
  );
}
