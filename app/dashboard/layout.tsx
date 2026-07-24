import { signOut } from "@/auth";
import { requireActiveUser } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";
import { APP_NAME } from "@/lib/app";

// The frame around ALL pages under /dashboard — sidebar, header, user menu.
// New protected pages are simply created as `app/dashboard/…/page.tsx` and get
// it automatically; they enter the navigation via NAVIGATION in
// components/app-shell.tsx.
//
// The sign-in check here is the second layer: the first is proxy.ts. Both
// together, because the layout needs the user data anyway — and because a
// check that lives only in the proxy can quietly disappear with a
// configuration change.
//
// requireActiveUser() additionally checks whether the account has been
// blocked. The proxy does not do that: it sees only the JWT — which holds the
// state from sign-in time — and it deliberately keeps the database out of the
// request path. That is exactly why the check sits here, at the one place
// every protected page passes through.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireActiveUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <AppShell
      appName={APP_NAME}
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
