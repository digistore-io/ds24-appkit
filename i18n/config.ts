// The app's languages — one place for everything locale-related.
//
// To add a language:
//   1. create `messages/<code>.json` (easiest: copy `de.json`),
//   2. add the code here to LOCALES and LOCALE_LABELS.
// The test `i18n/messages.test.ts` then automatically checks that no
// translation is missing.
//
// Deliberately WITHOUT a locale prefix in the URL: /plans stays /plans. The
// locale lives in a cookie (the switcher) and is derived from the browser on
// the first visit. That keeps proxy.ts responsible for sign-in alone.

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The locale used when the browser offers nothing suitable. */
export const DEFAULT_LOCALE: Locale = "de";

/** Name of the cookie holding the user's choice. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Display name per locale — always in that language itself, never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * Deliberately plain: quality weights (`;q=`) are honored, regions ignored
 * (`de-AT` counts as `de`). If the browser knows none of our languages,
 * DEFAULT_LOCALE applies.
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
