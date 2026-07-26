// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarClock, CreditCard, CircleUser, ArrowRight } from "lucide-react";

import { auth } from "@/auth";
import { hasDigistoreApiKey } from "@/lib/digistore/settings";
import { nextPaymentForMember } from "@/lib/digistore/subscriptions";
import { purchaseNoticeFor } from "@/lib/digistore/member-billing";
import { sellsPlans } from "@/lib/billing-mode";
import {
  NEXT_PAYMENT_FORMAT,
  isUpcoming,
  todayInUtc,
  toUtcDate,
} from "@/lib/digistore/next-payment";
import { FlashToast } from "@/components/flash-toast";
import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

// The starting point of your app after signing in. The sign-in check and the
// frame (sidebar, header) come from app/dashboard/layout.tsx.
//
// `?purchase=<ds24OrderId>` is where a buyer arrives from /optin/[orderId]
// after paying. Only the REFERENCE travels; what gets said is resolved here,
// from the database, scoped to the signed-in member — see §D2 of story 4.2 and
// the comment on <FlashToast>.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const { purchase } = await searchParams;
  // null for a foreign order, an unattributed one, and anything not `paid` —
  // the rule is in lib/digistore/purchase-notice.ts and is tested there.
  const notice = purchase
    ? await purchaseNoticeFor(session.user.id as string, purchase)
    : null;

  // The Digistore24 connection is a matter of the installation, not of the
  // user: it comes from .env (node run.mjs ds24-connect), not from a form.
  const connected = hasDigistoreApiKey();

  // When the Member is next charged — DISPLAY ONLY. It says nothing about what
  // they may use; that answer comes from lib/entitlements (AD-1, AD-2).
  //
  // `null` covers every case in which there is nothing honest to say: no
  // subscription, one that was never attributed to this account, one that has
  // been cancelled or refunded (§D3 NULLs the date then), and one whose date
  // has slipped into the past.
  //
  // Skipped entirely in a tokens-only app: there is no recurring charge to
  // announce, so the query is not asked either (lib/billing-mode.ts). Nothing
  // is hidden by that — the card only ever renders on an UPCOMING date, so a
  // legacy subscription would still be shown by flipping the mode back.
  const nextPaymentAt = sellsPlans()
    ? await nextPaymentForMember(session.user.id as string)
    : null;
  // The rule stated once more where it is rendered, so the card cannot advertise
  // a charge that will never come even if the query above is ever loosened.
  const showNextPayment = isUpcoming(nextPaymentAt, todayInUtc());

  return (
    <>
      {notice && (
        <FlashToast
          message={
            notice.kind === "tokens"
              ? t("purchaseTokens", { credits: notice.credits })
              : notice.kind === "plan"
                ? t("purchasePlan", { product: notice.product })
                : t("purchaseGeneric")
          }
          clearParam="purchase"
        />
      )}

      <PageHeader
        title={t("welcome")}
        description={t("signedInAs", { email: session.user.email ?? "" })}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t("statusTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? t("statusConnected") : t("statusDisconnected")}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t("accountTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <CircleUser aria-hidden className="text-muted-foreground size-4" />
            <span className="truncate text-sm">{session.user.email}</span>
            <RoleBadge role={session.user.role} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t("planTitle")}
            </CardTitle>
            <CardDescription>{t("planBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/plans">
                <CreditCard aria-hidden />
                {t("planCta")}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {showNextPayment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {t("nextPaymentTitle")}
              </CardTitle>
              <CardDescription>{t("nextPaymentBody")}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <CalendarClock
                aria-hidden
                className="text-muted-foreground size-4"
              />
              {/*
                next-intl's formatter, not toLocaleDateString: the language comes
                from the request (cookie / browser), not from the server's
                environment. NEXT_PAYMENT_FORMAT pins the zone back to UTC — see
                §D1, without it every viewer behind UTC reads the previous day.
              */}
              <time dateTime={nextPaymentAt!} className="text-sm font-medium">
                {format.dateTime(toUtcDate(nextPaymentAt!), NEXT_PAYMENT_FORMAT)}
              </time>
            </CardContent>
          </Card>
        )}
      </div>

      {!connected && (
        <Callout variant="warning" title={t("ds24Title")} className="mt-6">
          {t.rich("ds24Body", { code: (chunks) => <code>{chunks}</code> })}
          <pre className="bg-background mt-2 overflow-x-auto rounded-md border p-2 font-mono text-xs">
            node run.mjs ds24-connect
          </pre>
        </Callout>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("nextTitle")}
            <ArrowRight aria-hidden className="text-muted-foreground size-4" />
          </CardTitle>
          <CardDescription>{t("nextBody")}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
