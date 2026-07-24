import { getRequestConfig } from "next-intl/server";
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
  };
});
