"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./config";

/**
 * Stores the language choice in a cookie (one year) and reloads the page.
 *
 * Called by the language switcher (components/language-switcher.tsx). An
 * unknown value is silently ignored — the call comes from the browser and must
 * not be able to write arbitrary content into the cookie.
 */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Re-render all pages — the texts come from the request, not from state in
  // the browser.
  revalidatePath("/", "layout");
}
