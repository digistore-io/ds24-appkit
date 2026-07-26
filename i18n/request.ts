// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { getRequestConfig } from "next-intl/server";
import { IntlErrorCode } from "next-intl";
import { getUserLocale } from "./locale";

// next-intl's entry point: runs on every request and fixes the locale plus the
// texts for server AND client components. The file is wired up in
// next.config.ts (createNextIntlPlugin).
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    // Pinned, because a component that renders a CLOCK time is SSR'd in the
    // server's zone and hydrated in the viewer's — use-intl warns about exactly
    // this ("markup mismatches caused by environment differences"). Every
    // format.dateTime in the app was dateStyle-only until the Operator's member
    // page; that is why it never surfaced before.
    timeZone: process.env.APP_TIME_ZONE ?? "Europe/Berlin",

    messages: (await import(`../messages/${locale}.json`)).default,

    /**
     * What next-intl does when a text or a format fails.
     *
     * It does NOT throw. It reports here and renders a fallback instead — for
     * `format.dateTime()` that fallback is `String(value)`, so a bad date puts
     * the raw value into the page and the request still answers 200. Nothing
     * about the status code, the build or the test suite notices; only this.
     *
     * Which is why the error is logged rather than swallowed, and why
     * FORMATTING_ERROR gets a sentence with it. The stack trace points at the
     * `format.dateTime()` call, and that line is almost never the bug — the bug
     * is wherever the value was made. Without the sentence the obvious "fix" is
     * `new Date(value)` at the call site, which papers over a string that
     * carries no time zone and shifts the date by the host's offset.
     *
     * The error object is passed on its own so that Next can still resolve it
     * to a file, a line and a code frame; a wrapped message would lose that.
     * Somewhere to send these (Sentry and the like) belongs here too.
     */
    onError(error) {
      console.error(error);

      if (error.code === IntlErrorCode.FORMATTING_ERROR) {
        console.error(
          "[intl] The value handed to a formatter is not what its type claims.\n" +
            "       A raw sql`` expression and anything that travelled through JSON\n" +
            "       both give you a string, however convincingly it is typed as Date.\n" +
            "       Fix it where the value is produced — see CLAUDE.md → Dates and raw SQL.",
        );
      }
    },
  };
});
