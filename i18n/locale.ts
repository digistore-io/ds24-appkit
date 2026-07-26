// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLocale,
  type Locale,
} from "./config";

/**
 * The locale for this request: cookie (the user's choice) beats browser
 * (`Accept-Language`) beats the default.
 *
 * Callable on the server only. In components use `useLocale()` from
 * `next-intl` instead — it reads the same locale from context.
 */
export async function getUserLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  try {
    return matchLocale((await headers()).get("accept-language"));
  } catch {
    // Outside a request (e.g. a page prerendered at build time).
    return DEFAULT_LOCALE;
  }
}
