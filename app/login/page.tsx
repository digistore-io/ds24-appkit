import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { signIn, auth } from "@/auth";
import { ACCESS_DENIED } from "@/lib/authz";
import { isUserBlocked } from "@/lib/users/blocked";
import { isEmailLoginEnabled } from "@/lib/email";
import { isDevLoginActive, demoLoginSuggestion } from "@/lib/auth/dev-login";
import { APP_NAME } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

// Sign-in page. Default: email token sign-in (magic link, Postmark/SMTP).
// Google sign-in optional (only if GOOGLE_CLIENT_ID/SECRET are set).
//
// `?error=…` comes from two sources: from Auth.js when a sign-in was rejected,
// and from requireActiveUser() (lib/authz.ts) when a blocked account opens a
// protected page. Both set the same value — there is exactly one message for
// it.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();

  // Signed in? Then on to the dashboard — UNLESS the account is blocked.
  // Without that exception an endless loop would form: the dashboard sends
  // blocked users back here, and this line would send them straight back.
  // Instead they stay here and see the message below.
  if (session?.user && !(await isUserBlocked(session.user.id as string))) {
    redirect("/dashboard");
  }

  const t = await getTranslations("login");
  const tCommon = await getTranslations("common");
  const emailEnabled = isEmailLoginEnabled();
  // DEV only, and only as long as no mail transport is set up.
  const devLogin = isDevLoginActive();
  const demoEmail = await demoLoginSuggestion();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-end gap-2 p-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6 pb-24">
        <div className="text-center">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground mx-auto mb-4 grid size-10 place-items-center rounded-xl font-bold"
          >
            {APP_NAME.slice(0, 1).toUpperCase()}
          </span>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm text-balance">
            {t("subtitle")}
          </p>
        </div>

        {/* The message sits ABOVE the form: whoever lands here because their
            account is blocked should read why before trying again. It stays
            put (Callout, not a toast) — it is not an event passing by but a
            state. */}
        {error && (
          <Callout
            variant="danger"
            title={error === ACCESS_DENIED ? t("blockedTitle") : t("errorTitle")}
          >
            {error === ACCESS_DENIED ? t("blockedBody") : t("errorBody")}
          </Callout>
        )}

        {emailEnabled && (
          <Card>
            <CardContent>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("email", {
                    email: String(formData.get("email")),
                    redirectTo: "/dashboard",
                  });
                }}
                className="flex flex-col gap-3"
              >
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                />
                <Button type="submit" className="w-full">
                  {t("submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {emailEnabled && googleEnabled && (
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            {tCommon("or")}
            <span className="bg-border h-px flex-1" />
          </div>
        )}

        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              {t("google")}
            </Button>
          </form>
        )}

        {/* The demo login hangs off exactly one condition: isDevLoginActive()
            (i.e. isDevLoginAllowed). It ALWAYS appears when the development
            login is allowed — regardless of whether Google is configured.

            Deliberately terse: whoever lands here wants to look at the app,
            not set up mail delivery. The how lives in docs/ and in the
            terminal. */}
        {devLogin && (
          <Card>
            <CardContent>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("dev-login", {
                    email: String(formData.get("email")),
                    redirectTo: "/dashboard",
                  });
                }}
                className="flex flex-col gap-3"
              >
                <Callout variant="warning" title={t("devTitle")}>
                  <p>{t("devReason")}</p>
                  <p className="mt-2">
                    {demoEmail
                      ? t("devHint", { email: demoEmail })
                      : t("devHintAny")}
                  </p>
                </Callout>
                <Label htmlFor="dev-email">{t("emailLabel")}</Label>
                <Input
                  id="dev-email"
                  name="email"
                  type="email"
                  required
                  defaultValue={demoEmail ?? ""}
                  placeholder={t("emailPlaceholder")}
                />
                <Button type="submit" className="w-full">
                  {t("devSubmit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!emailEnabled && !googleEnabled && !devLogin && (
          <Callout variant="danger" title={t("missingTitle")}>
            {t.rich("missingBody", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </Callout>
        )}

        <Button asChild variant="ghost" size="sm" className="mx-auto">
          <Link href="/">
            <ArrowLeft aria-hidden />
            {t("backHome")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
