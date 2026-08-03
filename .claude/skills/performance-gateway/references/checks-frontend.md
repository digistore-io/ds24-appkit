<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Frontend check — `frontend`

The detail recipe for check 7 of the performance gateway. The menu, the
severity ladder and the finding format are in `SKILL.md`; the severity icons
below refer to that ladder.

Against the production build, or the deployed URL:

```bash
npx lighthouse http://localhost:3100/ --only-categories=performance \
  --chrome-flags="--headless" --output=json --output-path=.dev/lh-home.json
```

Needs a Chrome on the machine. If there is none, say so and measure what you can
(bundle size, `response`) rather than reporting nothing.

Measure the home page and `/plans` — those are the pages a stranger sees, and
the ones where a slow load costs a sale. The dashboard matters less; it is
behind a login and its visitors are already customers.

| Metric | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| Lighthouse performance | < 90 | < 75 | < 55 | < 35 |
| LCP | > 2.5 s | > 4 s | > 6 s | > 10 s |
| INP | > 200 ms | > 500 ms | > 800 ms | > 1 s |
| CLS | > 0.1 | > 0.25 | > 0.5 | > 1 |
| first-load JS, gzipped | > 200 kB | > 400 kB | > 800 kB | > 1.5 MB |

`npm run build` prints the first-load JS per route; read it rather than guessing.

What is usually behind it here:

- **`"use client"` where it is not needed.** Every client component and
  everything it imports ships to the browser. A page that could be a server
  component and is not is the single biggest bundle win in a Next.js app.
- **Images without `next/image`**, or without width and height — the second one
  is what CLS is made of.
- **A heavy import for a small job** — a whole date or icon library for one
  call. Check what `npm run build` attributes to each route.
- **Fonts.** `geist` is loaded through `next/font`, which handles this. A
  hand-rolled `@font-face` without `font-display: swap` is a finding.
- **Work on every render** that could be done once, or on the server.
