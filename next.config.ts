// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

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
  // Runs directly with `npm run start` (next start) on all four hosts in
  // docs/DEPLOY.md — Railway, Render, Fly.io and DigitalOcean.
  // For minimal Docker images, optionally set `output: "standalone"` and then
  // mit `node .next/standalone/server.js` starten.

  // The assistant reads her handbook from `content/knowledge/` at runtime, and
  // Next.js only copies what it can SEE being imported. A `readdirSync` is
  // invisible to that analysis, so with `output: "standalone"` the folder would
  // simply be absent from the image — and the symptom is not a build error but
  // an assistant who answers "I have no handbook" in production while working
  // perfectly on the machine that built her. Harmless without standalone.
  outputFileTracingIncludes: {
    "/api/chat": ["./content/knowledge/**/*"],
    "/dashboard/chat": ["./content/knowledge/**/*"],
    // Same mechanism for the knowledge-media route's disk leg. The keys are
    // picomatch route globs, so the dynamic segment's brackets and dots are
    // escaped to match the route path literally (the form the Next docs show
    // for dynamic routes).
    "/api/knowledge-media/\\[\\.\\.\\.path\\]": [
      "./content/knowledge-media/**/*",
    ],
  },

  // ── No `images.remotePatterns`, deliberately ─────────────────────────────
  // Media is served from the bucket rather than from this app, so the obvious
  // move is to allow the bucket's host here and let `next/image` resize. Two
  // things make that wrong, and a code review found both:
  //
  //  1. **This file is evaluated at BUILD time.** `MEDIA_S3_*` are secrets set
  //     in the hosting dashboard — at RUN time. On every host in
  //     `docs/DEPLOY.md` the pattern would bake as an empty list, and every
  //     bucket image would answer 400 in production while working perfectly in
  //     development, where the local driver serves from this origin.
  //  2. **A bucket endpoint is a SHARED host.** A pattern for
  //     `fra1.digitaloceanspaces.com` with no `pathname` matches `/**`, which
  //     turns `/_next/image` into an open resizing proxy for every bucket in
  //     that region — on the operator's CPU and egress.
  //
  // So bucket media goes to the browser unoptimised (`components/ui/figure.tsx`
  // decides that from the URL) and the limit lives in code rather than in an
  // environment variable somebody has to get right.
  //
  // **The cost, stated plainly and with no safety net behind it:** a large
  // picture reaches a phone at full size. Nothing in this repository catches
  // that. An earlier version of this comment said it was "exactly the finding
  // `ux-gateway` check 8 reports", and that was wrong in a way worth naming —
  // check 8 looks for an image NOT going through `next/image`, and `Figure`
  // does go through it, merely with `unoptimized`. The check cannot fire here.
  // Asserting a guard that does not exist is worse than admitting there is
  // none, because the next reader stops looking.
  //
  // The fix is to store a sensible size, not to resize on every request — the
  // upload ceilings in `config/media.json` are the closest thing to a brake,
  // and they bound the file rather than what a phone downloads.

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wires next-intl into the app: i18n/request.ts supplies the locale + texts per
// request. Without this line `useTranslations()` finds no translations.
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
