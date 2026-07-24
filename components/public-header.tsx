import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { APP_NAME } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

// Header of the public pages (home, plans) — the counterpart to the AppShell
// in the protected area. Carries language and light/dark so both are reachable
// BEFORE signing in.
//
// The button on the right depends on whether someone is signed in: "Go to
// dashboard" for signed-in visitors, "Sign in" for everyone else.
export async function PublicHeader() {
  const t = await getTranslations("home");
  const session = await auth();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold"
          >
            {APP_NAME.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{APP_NAME}</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button asChild size="sm">
            <Link href={session?.user ? "/dashboard" : "/login"}>
              {session?.user ? t("dashboard") : t("signIn")}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
