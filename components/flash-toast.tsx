"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * A short message for something that finished on ANOTHER page.
 *
 * The third of the template's three feedback mechanisms, and the one for the
 * case the other two cannot reach:
 *
 *   `<Callout>`            something that has to STAY on screen
 *   `useActionToast(state)` the result of a server action on the SAME page
 *   `<FlashToast>`          the result of something that ended in a redirect()
 *
 * The worked example is the purchase: `/optin/[orderId]` sends the buyer to
 * `/dashboard?purchase=<id>`, and the dashboard says what they just bought.
 *
 * THE MESSAGE NEVER TRAVELS IN THE URL. The parameter carries a reference —
 * an id — and the receiving page looks it up and decides what to say, scoped to
 * whoever is signed in. A URL carrying the sentence itself is a URL anybody can
 * hand somebody else to make their own app say whatever they typed.
 *
 *   const { purchase } = await searchParams;
 *   const notice = purchase ? await purchaseNoticeFor(session.user.id, purchase) : null;
 *   …
 *   {notice && <FlashToast message={t("purchaseGeneric")} clearParam="purchase" />}
 *
 * Renders nothing. The `<Toaster>` already sits once in `app/layout.tsx`.
 */
export function FlashToast({
  message,
  variant = "success",
  clearParam,
}: {
  message: string;
  variant?: "success" | "error" | "info" | "warning";
  /** Query parameter to drop afterwards, so a reload does not repeat the toast. */
  clearParam?: string;
}) {
  const router = useRouter();
  // React's StrictMode double-invokes effects in development. Without this
  // guard the toast appears twice on the developer's machine and once in
  // production — the worst possible way to find out about it.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;

    // queueMicrotask, NOT a bare toast() call — and this is not tidiness.
    //
    // This component's whole point is to speak on the FIRST paint after a full
    // page load, and at that moment the <Toaster> in app/layout.tsx has not
    // subscribed yet: React runs effects depth-first in tree order, this
    // component sits inside `{children}`, and the <Toaster> comes after it.
    // Sonner's publish() hands the toast to whoever is subscribed RIGHT THEN
    // and never replays it for anyone who subscribes later — so a toast fired
    // straight from this effect goes to nobody and is lost without a trace.
    //
    // The microtask drains after the commit's effects have all run, by which
    // time the <Toaster> is listening. Deliberately NOT cancelled on unmount:
    // the router.replace() below unmounts this component immediately, and
    // cancelling would swallow the very message it exists to deliver.
    //
    // `useActionToast` never hits this — it fires in response to a click, long
    // after everything has mounted.
    queueMicrotask(() => toast[variant](message));

    if (!clearParam) return;
    // window.location, not useSearchParams(): that hook forces every page
    // containing it into client-side rendering unless it is wrapped in
    // <Suspense>, and this component is meant to be dropped anywhere without
    // dragging that trap along. The effect only ever runs in the browser.
    const url = new URL(window.location.href);
    if (!url.searchParams.has(clearParam)) return;
    url.searchParams.delete(clearParam);
    // Soft navigation: the page re-renders without the parameter, resolves no
    // message, and renders no <FlashToast> — so this does not loop.
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [message, variant, clearParam, router]);

  return null;
}
