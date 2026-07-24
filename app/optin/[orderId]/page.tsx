import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PartyPopper } from "lucide-react";

import { Callout } from "@/components/ui/callout";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrderProcessing } from "./order-processing";

// Public thank-you page (the thankyou_url target after a purchase). It confirms
// the purchase arrived and polls until the IPN has created the order. No
// sign-in, and — by product decision — no consent prompt: just a confirmation.
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
          <Callout variant="success">{t("success")}</Callout>
        )}
      </div>
    </main>
  );
}
