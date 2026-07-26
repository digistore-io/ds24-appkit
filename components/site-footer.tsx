// The footer with the legal links.
//
// ── Why it exists at all ──────────────────────────────────────────────────
// § 5 DDG requires the provider identification to be *easily recognisable and
// directly reachable*, and the settled reading of that is: reachable from every
// page, in at most two clicks, under a label people recognise. A footer is how
// every site on the web does it, which is precisely what makes it recognisable.
//
// A privacy policy has the same problem from the other side (Art. 12(1) GDPR
// asks for the information to be *easily accessible*), and it has to be
// readable by somebody who has not signed in — which is why the legal pages are
// public and why this renders on the marketing pages too.
//
// ── It links only what exists ─────────────────────────────────────────────
// `availableLegalPages()` looks on disk. An app whose AGB has not been written
// gets no AGB link rather than a link to a 404 — and the moment
// `compliance-check` writes the file, the link is there with nothing to
// register.
//
// A server component: it reads the filesystem, and there is nothing here to
// click that needs state.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { APP_NAME } from "@/lib/app";
import { availableLegalPages } from "@/lib/legal/pages";
import type { Locale } from "@/i18n/config";

export async function SiteFooter() {
  const locale = (await getLocale()) as Locale;
  const [pages, t] = await Promise.all([
    availableLegalPages(locale),
    getTranslations("legal"),
  ]);

  return (
    <footer className="mt-auto border-t print:hidden">
      <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {new Date().getFullYear()} {APP_NAME}
        </span>

        {pages.length > 0 && (
          <nav aria-label={t("navLabel")}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {pages.map((slug) => (
                <li key={slug}>
                  <Link href={`/${slug}`} className="hover:text-foreground underline-offset-4 hover:underline">
                    {t(`${slug}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </footer>
  );
}
