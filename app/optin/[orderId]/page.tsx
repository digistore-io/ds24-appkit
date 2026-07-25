import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PartyPopper } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrderProcessing } from "./order-processing";

// Public thank-you page (the thankyou_url target after a purchase) — and a
// ROUTER, not a destination. It polls until the IPN has created the order and
// then sends the buyer where they can actually use what they paid for. No
// sign-in, and — by product decision — no consent prompt.
//
// Three ways out, once the order exists:
//
//   signed in, the order is theirs   → /dashboard, with the confirmation toast
//   signed in, it is somebody else's → stay, offer a link to the dashboard
//   not signed in                    → stay, offer the way in (see below)
//
// The last one is not an oversight to be redirected away: /plans is public and
// buying without an account is a supported path (story 1.6). Such an order
// carries member_id = NULL and is attached at the buyer's first sign-in
// (lib/digistore/claim.ts) — so this page is the only place that can tell them
// what to do next, and it has to name WHICH address to sign in with.
export default async function OptinPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const t = await getTranslations("optin");
  const order = await db.query.orders.findFirst({
    where: eq(orders.ds24OrderId, orderId),
  });

  // Public route (outside the proxy.ts matcher), so this only reads the JWT —
  // it never forces a sign-in.
  const session = await auth();
  const memberId = session?.user?.id;
  const isOwnPurchase =
    order != null && memberId != null && order.memberId === memberId;

  // Outside any try/catch on purpose: redirect() works by throwing, and a
  // catch that swallowed it would leave the buyer on this page for good.
  // The reference travels, never the message — the dashboard looks the order up
  // itself, scoped to the signed-in member (lib/digistore/member-billing.ts).
  if (isOwnPurchase) {
    redirect(`/dashboard?purchase=${encodeURIComponent(orderId)}`);
  }

  const signedIn = Boolean(session?.user);

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-end gap-2 p-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6 pb-24">
        <div className="text-center">
          <span
            aria-hidden
            className="bg-success text-success-foreground mx-auto mb-4 grid size-12 place-items-center rounded-full"
          >
            <PartyPopper className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>

        {!order ? (
          <OrderProcessing />
        ) : (
          <>
            <Callout variant="success">
              {t("received")}
              {/* Two sentences, two keys — never stitched together in code:
                  word order is not the same in every language. */}
              {!signedIn && <span className="mt-2 block">{t("signInBody")}</span>}
            </Callout>
            <Button asChild className="w-full">
              <Link href={signedIn ? "/dashboard" : "/login"}>
                {signedIn ? t("dashboardCta") : t("signInCta")}
              </Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
