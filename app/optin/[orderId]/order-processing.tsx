// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Callout } from "@/components/ui/callout";

// Shown while the purchase's IPN has not created the order row yet.
//
// The buyer's thankyou_url redirect to /optin/[orderId] regularly wins the race
// against Digistore24's IPN call to /api/ipn — the call that actually inserts
// the order (lib/digistore/payment-event.ts). So on the first render the order
// does not exist yet. Instead of telling the buyer to reload by hand, we poll:
// router.refresh() re-runs the server component every few seconds. The moment
// the IPN has landed and the order exists, the parent renders the way onward
// instead of this component — it unmounts and the interval is cleared. (There
// is no consent form here and never was: a purchase runs on Art. 6(1)(b), and
// this page prompts for nothing. See `page.tsx`.)
//
// The poll is capped at maxWaitMs. Refreshing forever hides a genuinely stuck
// purchase (a dead IPN endpoint — tunnel down, wrong URL registered) behind an
// eternal spinner. After the cap we stop and say so, pointing the buyer at
// their inbox / support instead of pretending everything is still fine.
export function OrderProcessing({
  intervalMs = 5000,
  maxWaitMs = 600_000, // 10 minutes
}: {
  intervalMs?: number;
  maxWaitMs?: number;
}) {
  const t = useTranslations("optin");
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (timedOut) return;
    const poll = setInterval(() => router.refresh(), intervalMs);
    const stop = setTimeout(() => setTimedOut(true), maxWaitMs);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [router, intervalMs, maxWaitMs, timedOut]);

  if (timedOut) {
    return (
      <Callout variant="warning" title={t("slowTitle")}>
        {t("slowBody")}
      </Callout>
    );
  }

  return (
    <Callout variant="info" hideIcon>
      <span className="flex items-center gap-3">
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        {t("processing")}
      </span>
    </Callout>
  );
}
