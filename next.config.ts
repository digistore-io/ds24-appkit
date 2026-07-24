import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Security headers, applied to every response.
//
// The one that does real work here is **Referrer-Policy**. This app puts
// single-use tokens in URLs — the Auth.js magic link, and the address-change
// confirmation link (app/account/confirm-email). A full `Referer` sent to
// another origin would carry that token out of the app, and the default a
// browser applies is not something to leave to the browser.
//
// Deliberately NOT here: a Content-Security-Policy. Next.js emits inline
// scripts and styles, so a useful CSP needs per-request nonces threaded through
// the app rather than a static header, and a `unsafe-inline` policy pasted in
// to make it "green" would only look like protection. That is its own piece of
// work — do it properly or not at all.
const securityHeaders = [
  // No Referer to other origins beyond the bare origin — keeps link tokens in.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No MIME sniffing: an uploaded or echoed file cannot talk a browser into
  // treating it as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app is never framed (no iframe anywhere in it), so clickjacking against
  // the money-adjacent admin pages and the account page is simply refused.
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers ignore this over plain HTTP, so it costs local development
  // nothing and protects a real deployment from the first request on.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Runs directly with `npm run start` (next start) on Railway/Render/Fly.
  // For minimal Docker images, optionally set `output: "standalone"` and then
  // mit `node .next/standalone/server.js` starten.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wires next-intl into the app: i18n/request.ts supplies the locale + texts per
// request. Without this line `useTranslations()` finds no translations.
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
