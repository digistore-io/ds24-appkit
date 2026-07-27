// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { APP_NAME } from "@/lib/app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return {
    // `template` appends the app name to every page title: "Plans · Your App".
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("subtitle"),
    // Asks the Dark Reader browser extension to leave this page alone — it has
    // a dark mode of its own (next-themes, the toggle in the header). Without
    // it the extension writes `data-darkreader-*` into every SVG BEFORE React
    // hydrates, and the first page view reports a hydration mismatch that is
    // not in this app's code at all. Officially provided for
    // (darkreader/CONTRIBUTING.md → "Disabling Dark Reader on your site").
    // Dark Reader only checks that the tag is THERE — its own test reads
    // `document.querySelector('meta[name="darkreader-lock"]') != null`, so the
    // content is never looked at. It says `"true"` because Next silently drops
    // an `other` entry whose value is the empty string, and then nothing ships.
    // A browser without the extension ignores an unknown meta name.
    // See CLAUDE.md → A hydration mismatch is not always yours.
    other: { "darkreader-lock": "true" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before React hydrates — the mismatch is intended and affects only this
    // one element.
    //
    // It is worth knowing what this does NOT cover: the attribute works one
    // level deep only. It says nothing about anything inside <body>, so it is
    // no answer to a browser extension rewriting the markup — that is what the
    // `darkreader-lock` above is for. Reaching for a second
    // suppressHydrationWarning further down the tree is the mistake this note
    // exists to prevent; it would silence the report without changing the DOM.
    //
    // The Geist fonts ship as files in the `geist` package (no fetch from
    // Google Fonts at build time) and hang off <html> as CSS variables;
    // app/globals.css wires them up via --font-sans / --font-mono.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        {/* Passes locale and texts down to all client components —
            `useTranslations()` only works inside this provider. */}
        <NextIntlClientProvider>
          <ThemeProvider>
            <TooltipProvider delayDuration={300}>
              {/* "You are signed in as somebody else." Renders nothing at all
                  unless an Operator is inside a customer's account — but it is
                  HERE, above every page including the public ones, because the
                  moment it is missing from one is the moment somebody forgets.
                  It reads the session token only; no query. See the component. */}
              <ImpersonationBanner />
              {children}
              {/* Short messages after an action ("saved", "deleted"). Sits
                  here once for the whole app — in pages just call
                  `toast.success(...)` from `sonner`, or use the
                  `useActionToast` hook. */}
              <Toaster position="bottom-right" richColors />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
