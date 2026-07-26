// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KeyRound, ShoppingCart, Sparkles, ArrowRight } from "lucide-react";

import { APP_NAME } from "@/lib/app";
import { hasDigistoreApiKey } from "@/lib/digistore/settings";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { SiteFooter } from "@/components/site-footer";

// Public home page. Replace this content with your landing page — though the
// structure (header, hero, three cards) already carries as it is.
export default async function Home() {
  const t = await getTranslations("home");

  const features = [
    { icon: KeyRound, title: "features.authTitle", body: "features.authBody" },
    {
      icon: ShoppingCart,
      title: "features.billingTitle",
      body: "features.billingBody",
    },
    { icon: Sparkles, title: "features.readyTitle", body: "features.readyBody" },
  ] as const;

  return (
    <>
      <PublicHeader />

      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-5">
            {t("badge")}
          </Badge>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            {t("title", { app: APP_NAME })}
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-balance">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                {t("signIn")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/plans">{t("plans")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <div className="bg-primary/10 text-primary mb-2 grid size-9 place-items-center rounded-lg">
                  <Icon aria-hidden className="size-4.5" />
                </div>
                <CardTitle>{t(title)}</CardTitle>
                <CardDescription>{t(body)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Only while billing is not set up yet — after that the notice
            disappears from the public page on its own. */}
        {!hasDigistoreApiKey() && (
          <Callout variant="info" className="mt-10">
            {t.rich("setupHint", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </Callout>
        )}
      </main>

      {/* The legal links. Public pages need them most: § 5 DDG asks for the
          Impressum to be reachable, and the person deciding whether to sign up
          is exactly the person who has to be able to read the privacy policy
          first. */}
      <SiteFooter />
    </>
  );
}
