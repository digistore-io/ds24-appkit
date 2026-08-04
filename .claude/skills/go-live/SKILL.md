---
name: go-live
description: Brings the app online and proves that a purchase really unlocks access. Runs the pre-flight check, hands the hosting itself to setup-hosting (host, CLI, secrets, managed Postgres, migration hook, domain), then does the live part — Digistore products and approval, the IPN on the live domain, a smoke test, a test purchase and a re-check of security/performance against the live instance. Use this when the app is built, secured and scaled — before marketing.
requires: 0.7.0
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Go-Live — putting it online and verifying it

Goal: get the app **reliably live** and prove that the purchase-to-access flow
works in production. Guide the user step by step; they do not have to know
anything technical by heart.

The **hosting itself is its own skill** — `setup-hosting` — because it is a
conversation of its own: which host, what it costs, an account, a CLI, a token,
a database. This skill owns the two ends around it: is the app ready to go, and
does it really sell once it is up.

## 1. Pre-flight (before the deploy)

- **Green locally:** `node run.mjs test` (typecheck + tests) and `node run.mjs build` without
  errors. Run them yourself — do not hand the commands to the user.
- **Mail delivery exists.** In STAGING/PROD it is **mandatory** — without it the
  app aborts at startup (`lib/env-guard.ts`), because the development login does
  not exist there and nobody could sign in. `node run.mjs mail-setup` if it is
  missing. This is the single most common reason a first deploy fails.
- **The sender address lives on the app's own domain, and the mails carry the
  app's name.** A sign-in mail whose links point at `your-domain.de` but whose
  From is some other domain is the exact shape of a phishing mail — recipients
  report it, and enough reports put the domain on Google's Safe Browsing list
  (a red "Dangerous site" page in front of every sign-in link; recovery:
  [`docs/troubleshooting.md`](../../../docs/troubleshooting.md) → *Chrome
  calls the sign-in link a "Dangerous site"*). So: sender = an address on the
  app's domain, verified at the provider (Postmark sender signature / DKIM,
  SPF), and `NEXT_PUBLIC_APP_NAME` set **at the host** — the mails read it
  too, and without it they open with a generic "Sign in" instead of the
  product's name.
- **Somewhere for files to live — *if the app takes files*.** On a host a local
  disk is not storage: the next deploy takes every uploaded file with it, and
  with two instances a customer's picture is present about half the time — a
  fault that only appears after the app is successful and cannot be reproduced
  on one machine. So `MEDIA_DRIVER=local` outside DEV stops the app booting, the
  same way missing mail does and in the same file.

  **With one exception, and it is the one to check here.** An app whose
  `config/media.json` says `"enabled": false` is exempt — it accepts no files,
  so requiring it to book storage before it could deploy at all would be a bill
  for nothing. That exemption is why this is a pre-flight item rather than
  something the boot guard settles: **switching media ON later without a bucket
  is a state nothing refuses at startup.** So ask both halves, in this order:

  1. Does this app take files at all? (`config/media.json` → `enabled`, and
     whether anything calls `acceptUpload()` or `createMedia()`.)
  2. If yes — `node run.mjs media-check`. It says where files go and, with a
     bucket configured, proves it by writing, reading and deleting a throwaway
     object.

  Booking one is part of **`setup-hosting`** (step 6b); this is the check that
  it really happened.
- **Migrations ready:** `drizzle/` up to date (`npm run db:generate` after schema changes).
- **Legally ready:** `node run.mjs legal-check`. It exits non-zero on the things
  that must not meet a customer — an Impressum still carrying the shipped
  placeholder (§ 5 DDG), a privacy policy that has not been written (Art. 13
  GDPR), an assistant switched on without the AI notice (Art. 50 EU AI Act,
  applicable since 2 August 2026). It also says whether the retention jobs have
  actually run: *"last run: never"* means the retention period in your privacy
  policy is not describing your app.
  **Run it before the deploy, not after.** A placeholder Impressum on a live
  domain is both a legal problem and the first thing a visitor reads. What fixes
  it is the skill **`compliance-check`**.

## 2. Hosting → **`setup-hosting`**

Start that skill and let it finish. It picks the host with the user (Railway,
Render, Fly.io or DigitalOcean), says what it costs before anything is booked,
installs the CLI, authenticates, creates the app, the managed Postgres and the
media bucket, sets every environment variable, wires `npm run db:migrate` into the deploy and puts
a domain on it. The reference behind it is [`docs/DEPLOY.md`](../../../docs/DEPLOY.md).

Come back here when the app answers on its domain.

## 3. Database in production

Handled by `setup-hosting`: the migration is a **pre-deploy step at the host**
(`npm run db:migrate`), so it runs before each new version takes traffic. If it
was left out, put it in now rather than migrating by hand — a manual step in a
deploy is a step that gets skipped exactly once.

**The operator account** does not create itself. A fresh production database is
empty, and the "first sign-in becomes owner" rule is DEV-only: on a live app the
first person through the door may be a customer. Against the production
`DATABASE_URL`:

```
node run.mjs user-create --email you@example.com --role owner --apply
```

## 4. Digistore: products, approval & IPN on live

All environments use **the same live products** (see `docs/environments.md`).
Once, before selling:

1. **Sync the products + IPN** (from `config/digistore-products.json`) — **you
   run this**, do not hand the command to the user:
   `node run.mjs ds24-sync`
   → creates them via `createProduct` / updates them via `updateProduct`, writes
   the ids back into `productIdByLanguage` **and** registers the IPN. Do not
   call `node scripts/ds24/sync-products.mjs` directly: that skips the IPN, and
   purchases then unlock nothing.

   **One product per plan AND language, and this is the last moment to get it
   right.** A Digistore24 product carries exactly one language, and that is the
   language of the **order form** — `createBuyUrl` cannot override it. If this
   app's UI speaks two languages and a plan declares only one under
   `"productIdByLanguage"`, half your customers are asked for their card details
   in the wrong language, on a live shop. The sync warns about every such gap:
   **read those warnings, fix the registry, run it again.** Fixing it after the
   launch means new products, new approvals and links you have already given
   out pointing at the old ones.
2. **Nothing to do about prices.** Price, currency and interval live in
   `config/digistore-products.json` and travel with the checkout call as
   `payment_plan[...]`. Do **not** create payment plans in the DS24 interface —
   a second price would only drift from the first.
3. **Request approval:** `node run.mjs ds24-approval --apply`
   → sets `approval_status = pending` per product (via `updateProduct`). The
   marketplace follows **the product's own language** — the key it sits under in
   `productIdByLanguage`: German → Germany reseller (id 1), anything else → USA
   (id 2). So a plan sold in both languages is **two products** and is submitted
   to **two marketplaces**, each getting its own verdict; they are listed as
   `pro (de)` and `pro (en)`. **Approved in Germany says nothing about the
   English twin**, and that twin is the one that gets forgotten — check that
   every row reaches `approved`, not just the first. The dry run prints the
   target marketplace per product, so read those lines before `--apply`.
   `--lang en --apply` forces one language for the whole run, `--siteowner <id>
   --apply` a specific reseller.

   > **Selling as a Direct Seller? Then skip this step entirely.** Only the four
   > resellers — Germany (1), USA (2), UK (3), Ireland (4) — approve products. A
   > vendor selling on their own account has no approval step, nothing to
   > request and nothing to wait for. The command says so and writes nothing,
   > and the session greeting stays silent. Do not go looking for an approval
   > that does not exist.

   Products can
   only be sold publicly once Digistore24 has approved them. Only request
   approval when the product description and the app are mature.

   Whether it was **granted** you can check any time with
   `node run.mjs ds24-approval` (without `--apply` — the dry run is the status
   view), and the session greeting reports a pending or rejected approval by
   itself, once a day, as does `node run.mjs doctor`. A product counts as
   approved once **one** marketplace has approved it. Refusals to expect rather
   than fight: `--apply` **skips** a product already approved at the marketplace
   it would write to (always — `--force` does not lift that one), and
   **refuses** a product whose status it could not read, a marketplace your
   account is not active at, and any `--status` other than `pending`.
   Resubmitting an approved product is a step Digistore24 does not document, and
   writing `approved` yourself would silence every reminder for a product no
   reseller ever saw. Pass `--force` only if you know why.

   > **A rejected product is not resubmitted unchanged.** The reason is in the
   > vendor's Digistore24 account; fix it there first, otherwise the second
   > attempt is the slower repeat of the first.

   > **Test first — without approval only the test purchase works.** As long as a
   > product is not approved, only **test purchases** are possible. On the LIVE
   > instance the vendor sets the test-purchase cookie once (instructions from
   > Digistore24): <https://help.digistore24.com/hc/de/articles/23901169396241>.
   > The automatic test-payment parameter that DEV checkout links carry never
   > activates here — deliberately (`lib/digistore/testpay.ts`).
   >
   > **And rotate the test-purchase key before the launch:**
   > `node run.mjs ds24-testpay --recreate`. The key is account-level; a copy
   > from the development phase, pasted onto a live checkout URL, would unlock
   > test purchases for whoever holds it. Rotating invalidates every old copy.
4. **Point the IPN at the live domain**: as soon as `APP_URL` points to the
   public domain, `node run.mjs ds24-sync` registers the IPN automatically
   via the API (the URL is always `/api/ipn`) and writes the generated SHA512
   passphrase into the `.env` as `DIGISTORE_IPN_PASSPHRASE`. Store this value
   **and** the `DIGISTORE_IPN_DOMAIN_ID` as secrets at the host. Separately it
   works with `node scripts/ds24/ipn-setup.mjs --url "https://YOUR-DOMAIN/api/ipn"
   --domain "YOUR-DOMAIN" --apply`.

> Testing locally (DEV): receive IPNs via a free Cloudflare Quick Tunnel —
> `node run.mjs ds24-tunnel` opens the address and registers it as the IPN endpoint in one
> go (`docs/environments.md`).

## 5. Smoke test (live)

- `https://YOUR-DOMAIN/api/healthz` → `{"status":"ok"}`, `/api/readyz` → `ready`.
- **Call every page:** `node run.mjs smoke --url https://YOUR-DOMAIN` or
  `node scripts/dev/smoke.mjs --url https://YOUR-DOMAIN`. No 5xx — otherwise
  the launch is not finished. Production runs into errors that never showed up
  locally (missing env values, migrations that were never applied).
- Test the sign-in (Google/e-mail). **Look at the mail itself, not only the
  landing**: does it name the product, does the button work, do the footer's
  legal links point at the live domain, and does the Impressum's text stand
  below them **in the mail's footer**? (Mails only — on the app's pages the
  footer *link* to `/impressum` is the complete answer; never copy the
  Impressum's text into page footers. `docs/compliance.md` §4.) A generic
  "Sign in" mail means `NEXT_PUBLIC_APP_NAME` is missing at the host; a
  footer without links means `APP_URL` is; a mail footer without the
  Impressum block means the Impressum still carries the shipped placeholder —
  which `legal-check` in the pre-flight already refuses.
- **Domain reputation:** verify the domain in **Google Search Console** now,
  not when something goes wrong — it is where Google reports a Safe-Browsing
  flag, and the only place a review can be requested. Then check the current
  verdict once:
  `https://transparencyreport.google.com/safe-browsing/search?url=YOUR-DOMAIN`.
  A fresh domain that starts life mailing sign-in links is exactly the pattern
  the blocklist watches for; if it ever flags, the recovery path is
  [`docs/troubleshooting.md`](../../../docs/troubleshooting.md) → *Chrome
  calls the sign-in link a "Dangerous site"*.
- **Knowledge media, if this app has any on the bucket leg.** No
  `.data/knowledge-media/` folder and no `media:` entries in
  `content/knowledge/` means nothing to do here — one sentence, walk on.
  Otherwise the production store has to be filled, or every media suggestion
  in the assistant's answers 404s on the live app while every local gate stays
  green. `kb-media-sync` copies into whichever store the environment's
  `MEDIA_*` variables name, so run it **with the production store values set**
  — the same ones `setup-hosting` (step 6b) stored as secrets at the host:
  `node run.mjs kb-media-sync --apply`, then `node run.mjs kb-check` under the
  same configuration. **`kb-check` green against the production store is the
  exit condition** — an unreachable store is a failure to fix, never a skip.
  The reference is [`docs/knowledge.md`](../../../docs/knowledge.md).
- **Purchase flow:** trigger "test connection" in Digistore24 (IPN `connection_test`
  → 200) and play through a real/test purchase → the order shows up, access is
  unlocked.
- Custom domain + HTTPS active.

## 6. Checking the experience, security & performance against LIVE

- Run **`ux-gateway`**, **`security-gateway`** and **`performance-gateway`**
  once more against the live instance — the full pass in each, and this time the
  `host` check has something to look at and the load test runs against the live
  URL at `-c 100`. All three write a dated report into `docs/reports/`; those
  three are the record that the launch was checked. Only when they are green is
  "live" really finished.
- **`ux-gateway` has something here it cannot have locally: a real purchase on
  the real domain.** Buy one as a stranger would, on a phone, and stop on the
  page you land on afterwards. That is the screen the whole launch is judged on,
  and it is the one nobody sees until the day it is live.

## 7. Safeguards

- Know the rollback path (roll the previous deploy back at the host).
- Backups of the production DB enabled.

## Principles
- **Test live first, then advertise.** Do not market anything that is not verified live.
- **Secrets only at the host**, never in the code/repo.

Next step after a successful go-live: **`go-to-market`** (marketing).
