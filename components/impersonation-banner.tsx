// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// "You are signed in as somebody else" — on every page, until it ends.
//
// ── Why it is in the ROOT layout ───────────────────────────────────────────
// `AppShell` wraps `/dashboard` only. A banner inside it would silently
// disappear on the home page, `/plans` and `/login` — and that gap is exactly
// where the failure this exists to prevent happens: an Operator navigates out
// to a public page, comes back, and the app looks entirely normal. There is no
// page of this app on which being somebody else is not worth saying.
//
// ── Why it costs a public page nothing ─────────────────────────────────────
// `auth()` decodes the session cookie. It does not touch the database — the
// impersonation, both addresses and the deadline all travel inside the signed
// token (lib/impersonation/claim.ts), precisely so that this component can run
// on the home page of a signed-out visitor without adding a query to it. Keep
// it that way: a `isUserBlocked()` or a user lookup in here would put a
// round-trip on every anonymous request the app ever serves.
//
// The import is dynamic for the same reason `lib/authz.ts` does it — `@/auth`
// pulls in the Drizzle adapter and the mail transport, and neither belongs in
// the module graph of a static public page.
//
// ── Why it is not sticky ───────────────────────────────────────────────────
// It sits at the top of the document flow rather than pinned to the viewport.
// `AppShell` already has a `sticky top-0 z-30` header; a second sticky element
// at the same offset would either cover it or be covered by it, and the version
// that covers it hides the navigation. Being the first thing on every page —
// unmissable on arrival, on every navigation, and impossible to dismiss — is
// what the job actually needs.
import { getTranslations } from "next-intl/server";
import { Callout } from "@/components/ui/callout";
import {
  ImpersonationExit,
  ImpersonationEnded,
} from "@/components/impersonation-exit";

export async function ImpersonationBanner() {
  const { auth } = await import("@/auth");
  const session = await auth();
  const impersonation = session?.user?.impersonation;

  // The thirty minutes ran out. The app is already answering as the Operator
  // again — this says so once, rather than letting them discover it by noticing
  // the page looks different. The component also clears the leftover claim.
  if (!impersonation && session?.user?.impersonationEnded) {
    return (
      <div className="border-b border-info-border">
        <Callout
          role="alert"
          variant="info"
          className="mx-auto max-w-6xl rounded-none border-0 px-4 py-2"
        >
          <ImpersonationEnded />
        </Callout>
      </div>
    );
  }

  if (!impersonation) return null;

  const t = await getTranslations("impersonation");
  const member = impersonation.memberEmail ?? t("unknownMember");
  const operator = impersonation.operatorEmail ?? t("unknownOperator");

  return (
    <div className="border-b border-warning-border">
      <Callout
        // `role="alert"` rather than the Callout's own `role="status"`: this one
        // SHOULD interrupt. A screen-reader user who is not told which account
        // they are in has no other way to find out.
        role="alert"
        variant="warning"
        // Squared off and full-bleed, so it reads as a property of the window
        // rather than as one more notice inside the page (FR-62).
        className="mx-auto flex max-w-6xl items-center gap-3 rounded-none border-0 px-4 py-2"
      >
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          {/* Both identities. One name alone is ambiguous to exactly the person
              this banner exists for — it is the contrast that stops the drift. */}
          <span>
            {t.rich("signedInAs", {
              member,
              operator,
              strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            })}
          </span>
          <ImpersonationExit expiresAt={impersonation.expiresAt} />
        </div>
      </Callout>
    </div>
  );
}
