import { signOut } from "@/auth";
import { requireActiveUser } from "@/lib/authz";
import { AppShell } from "@/components/app-shell";
import { APP_NAME } from "@/lib/app";
import { chatConfig, isChatEnabled } from "@/lib/ai/chat-config";
import { chatNavVisible, mayUseChat } from "@/lib/ai/rules";
import { isOwner } from "@/lib/roles";
import { hasPlan } from "@/lib/entitlements/manage";
import { ChatLauncher } from "@/app/dashboard/chat/launcher";

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
    // Signing out while acting as somebody else ends BOTH identities — the
    // session is destroyed, so there is no half-exit that could leave an
    // Operator authenticated as a customer they thought they had left.
    //
    // The record is closed on the way out. The scheduled job would eventually
    // do it (`close-impersonations`), but only once the cap had passed, and
    // until then the record page would show a session as running that ended the
    // moment somebody pressed "sign out". A row that is wrong for half an hour
    // is worse than one written a moment later.
    const impersonation = session.user.impersonation;
    if (impersonation) {
      const { closeImpersonation } = await import("@/lib/impersonation/manage");
      await closeImpersonation(impersonation.id, "signout");
    }
    await signOut({ redirectTo: "/" });
  }

  // The assistant, on every protected page rather than only on her own. Both
  // halves are resolved HERE, on the server: `isChatEnabled()` reads config
  // files and `hasPlan()` reads `grants` — never a billing table — and neither
  // belongs in a browser bundle.
  //
  // `hasPlan` is asked only when a plan is actually required, so the ordinary
  // app (`requiresPlan: null`) adds no query to any page. And this decides what
  // is SHOWN: `app/api/chat/route.ts` asks the same questions again on every
  // request, because a button nobody rendered is not a check.
  const chat = chatConfig();
  const chatEnabled = isChatEnabled();
  const chatAvailable = mayUseChat(
    chatEnabled,
    chat.requiresPlan,
    chatEnabled && chat.requiresPlan !== null
      ? await hasPlan(session.user.id as string, chat.requiresPlan)
      : false,
  );

  return (
    <>
      <AppShell
        appName={APP_NAME}
        user={{
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
        // Resolved here rather than in the shell: `isChatEnabled()` reads the
        // product registry, and that JSON carries prices and Digistore24 product
        // ids. The shell is a client component — it gets the answer, not the file.
        //
        // NOT `chatEnabled` on its own: an assistant switched on in
        // config/ai-chat.json whose provider key is missing would otherwise hide
        // the one page that says so. See `chatNavVisible()`.
        features={{
          chat: chatNavVisible(
            chatEnabled,
            chat.enabled,
            isOwner(session.user.role),
          ),
        }}
        signOutAction={signOutAction}
      >
        {children}
      </AppShell>

      {/* Beside the shell, not inside it. The launcher is `position: fixed`,
          and a `transform` on any ancestor — the sidebar animates with one —
          would make that ancestor its containing block and pin the button to
          the middle of the page instead of the window. */}
      {chatAvailable && (
        <ChatLauncher assistantName={chat.name} avatar={chat.avatar} />
      )}
    </>
  );
}
