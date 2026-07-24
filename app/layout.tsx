import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return {
    // `template` appends the app name to every page title: "Plans · Your App".
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("subtitle"),
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
