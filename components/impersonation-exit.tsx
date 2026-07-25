"use client";

// The two client-side pieces of the impersonation banner.
//
// The banner itself (components/impersonation-banner.tsx) is a server component
// and stays one — it reads the session, which has no business in a browser
// bundle. What has to be here is the part that needs a clock and a transition.
import { useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  stopImpersonationAction,
  clearEndedImpersonationAction,
} from "@/app/impersonation-actions";

/**
 * "Beenden", plus the timer that presses it when nobody does.
 *
 * The cap exists for the laptop somebody walked away from, and a cap that only
 * takes effect on the next request is not much of one for a tab left open on a
 * customer's account. So the deadline is watched here too: when it passes with
 * the page still open, the session ends by itself.
 *
 * The server does not depend on this. Every read of the session honours the
 * expiry regardless (lib/impersonation/claim.ts), and the scheduled job closes
 * the record if the browser is gone entirely. This is the part that makes the
 * screen stop showing somebody else's account — not the part that enforces it.
 */
export function ImpersonationExit({ expiresAt }: { expiresAt: number }) {
  const t = useTranslations("impersonation");
  const [pending, start] = useTransition();

  useEffect(() => {
    const remaining = expiresAt - Date.now();
    // Already past it — the server will report `impersonationEnded` on the next
    // load anyway; nothing to schedule.
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      start(async () => {
        await clearEndedImpersonationAction();
      });
    }, remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          // The action redirects on success, so nothing comes back in the
          // normal case. A returned value is a refusal and is worth saying out
          // loud — silently doing nothing is how somebody concludes the button
          // is broken and goes looking for another way out.
          const result = await stopImpersonationAction();
          if (result?.error) toast.error(result.error);
        })
      }
    >
      {t("stop")}
    </Button>
  );
}

/**
 * Says once that the session ran out, and tidies the leftover away.
 *
 * The claim survives in the token past its own deadline because no page render
 * may write a cookie — see `clearEndedImpersonationAction`. Without this the
 * message would reappear on every page until the Operator signed out.
 *
 * `useRef` rather than state: React runs effects twice in development Strict
 * Mode, and two `unstable_update` calls racing at the same cookie is a
 * needless way to lose one.
 */
export function ImpersonationEnded() {
  const t = useTranslations("impersonation");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void clearEndedImpersonationAction();
  }, []);

  return <span>{t("ended")}</span>;
}
