---
name: setup-digistore
description: Sets up Digistore24 billing for the app — fetch the API key into the `.env` via `node run.mjs ds24-connect`, then create products with `node run.mjs ds24-sync` and register the IPN connection (webhook + SHA512 passphrase) via API, test the connection and generate checkout links. The agent runs the commands itself. Use this as soon as the app is meant to receive sales or process completed purchases.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Setting up Digistore24 billing

The entire Digistore integration is ready to use in `lib/digistore/` and
`app/api/ipn/route.ts`. You set up the billing **yourself** — you don't merely
explain it to the user. You don't rewrite the integration.

## You do this — not the user

You call the commands below through your Bash tool. Do *not* tell the user to
type `make …` or `! make …` — most users are not developers and wouldn't know
what to do with that.

**Never say that you "cannot obtain" the API key or the products for the user.**
That is wrong: the commands exist for exactly that purpose.

- **Obtain the API key** → you call `node run.mjs ds24-connect` (fetches the operator's
  key and writes it into the `.env`).
- **Create products + IPN** → you call `node run.mjs ds24-sync` (creates
  the plans from `config/digistore-products.json` at Digistore24, writes the
  `productId` back and registers the IPN connection via API). Product IDs are
  **nothing the user has to obtain** — the app brings the plans with it, the
  script generates the IDs.

The **only** step that necessarily stays with the user is one click: the
authorization in the browser at Digistore24 (the authorization itself — no tool
can click that away for them). Everything else you do.

## First: is the operator the only vendor?

Almost always yes, and then everything below applies unchanged: **one** Digistore24
account per installation, the key in the `.env`, the operator gets paid. That is
what this template is built as.

Ask the other question only when it is genuinely open — **does anybody other than
the operator get paid?** If the app's own users are meant to sell to *their*
customers (a course platform, a booking tool for coaches, a shop builder), that
is the **platform** shape: each user connects their own Digistore24 account, and
you need a **Developer** API key of your own. It is not a setting and it is not
built here — the API key, the IPN passphrase, the product ids and the order table
all become per-tenant. **Do not start building it from memory:**
`docs/digistore-integration.md` carries both shapes and the full design for the
platform one, including the two mistakes that cost money (a checkout URL cached
across tenants, and attribution taken from the payload instead of the
connection).

Do not raise the question unprompted with a user who simply wants to sell their
own app, and do not build the platform shape "just in case".

## How the billing works

Digistore24 is the payment provider. Your app doesn't handle any money, it
**reacts to events** from Digistore24:

- Purchase → IPN event `on_payment` → the payload's `tracking[custom]` is parsed
(`m:<memberId>;t:<checkoutToken>;p:<productKey>;k:<kind>`), the payment is
attributed to a Member — the identity first, the buyer email only as an
unauthenticated fallback, ambiguity refused — and a row is written to `orders`
with `memberId`, `productKey`, `credits`, `ds24PurchaseId` and status `paid`.
**An unattributed payment is recorded but never credited**; it is credited when
the buyer first signs in, or when the operator attaches it under
`/dashboard/admin/purchases`.
- Refund/chargeback/missed subscription payment → status gets updated.
- Every order is unique via `ds24OrderId` (idempotent).

## Setup steps (guide the user through these)

The credentials are fetched **in the terminal**, not in the app. There is
deliberately no interface for entering or generating a key.

1. **Connect the API key.** **Run `node run.mjs ds24-connect` yourself** (your Bash
   tool) — do *not* ask the user to type `! node run.mjs ds24-connect`. Most users are
   not developers and wouldn't know what to do with a command like that; your
   job is to run it for them.

   This is how you go about it:
   - Tell the user **beforehand** in one sentence what is about to happen: "I'm
     now establishing the connection to Digistore24. Your browser will open in a
     moment — sign in to Digistore24 there and confirm the access. I'll take
     care of the rest."
   - Then call `node run.mjs ds24-connect`. Choose a **generous timeout (10 minutes /
     600000 ms)**, because the script waits until the user has granted access in
     the browser (it gives up after 8 min).
   - The script opens the authorization page and then asks Digistore24 every
     couple of seconds whether the approval has happened — it does **not** wait
     for anything to be delivered to this machine. Once it has, it fetches the
     key and writes `DIGISTORE_API_KEY` into the `.env` — plus
     `DIGISTORE_IPN_PASSPHRASE`, if Digistore24 supplies it. For checkout links
     a **`writable`** key is required (the script's default requirement).
   - **Never open a second web server for this, and never suggest one.** The
     script used to, on a high port, for that one redirect back — and it was
     regularly already gone by the time the user finished clicking, so the
     browser said "this page cannot be loaded" while the approval had gone
     through fine. The app's own server is running anyway; that is the one that
     is used.
   - If **no** browser opens (headless/remote), the script prints the URL as
     text — pass it on to the user to click.
   - Once the call has finished with `✓ DIGISTORE_API_KEY saved in .env`,
     confirm that to the user and continue with step 2.

   - Digistore24 does not accept `localhost` as a `return_url` — not as a
     `site_url` either. That's why both run through the public redirect page
     (`https://ds24-appkit.com/redir/?port=3000&path=/ds24-connected`),
     which sends the browser back to `http://localhost:<port>/ds24-connected` —
     a page of the app itself (`app/ds24-connected/page.tsx`). Neither that page
     nor the redirect ever sees the API key; the script fetches it directly from
     Digistore24. The address is hard-wired in `lib/digistore/config.mjs`;
     `--no-relay` uses localhost directly (only on test hosts).
   - **The app does not have to be running.** The landing page is a courtesy for
     whoever is looking at the browser — the key arrives in the terminal either
     way. If the user reports that the page after the approval did not load, do
     **not** treat that as a failed setup: read the terminal output, which says
     `✓ Approval received.` and then `✓ DIGISTORE_API_KEY saved in .env`.
   - Flags: `--print` only displays the key without saving it; `--port <n>` says
     which port the app runs on, for the rare case the script guesses wrong
     (normally it takes `APP_URL` from the `.env`). `--manual` asks for a key you
     created yourself (Digistore24 → Settings → API) — that needs a keyboard
     entry and is the **emergency route** for when the user runs the command
     themselves in the terminal; you yourself always use the automatic route
     (without `--manual`).
2. **Create products and IPN.** **Run `node run.mjs ds24-sync` yourself.**
   One command, idempotent, does both:
   - **Products:** reads the plans from `config/digistore-products.json` (the
     source of truth that also feeds `/plans`), creates each one at Digistore24
     or updates it and writes the `productId` back into the config.
   - **IPN connection:** registers the webhook `…/api/ipn` **via API** directly
     at Digistore24 (`ipnSetup`) — the user has to enter **nothing** in the DS24
     interface for that. The SHA512 passphrase is generated in the process and
     written into the `.env` as `DIGISTORE_IPN_PASSPHRASE`; a stable
     `DIGISTORE_IPN_DOMAIN_ID` keeps the connection idempotent across runs.
     The same call is the update — Digistore24 looks a connection up by
     (merchant, API key, `domain_id`) and updates the one it finds.

   - **Two things about that registration are worth knowing, because both fail
     silently when they are wrong** (full version in
     `docs/digistore-integration.md`):
     - **The `domain_id` has to be UNIQUE, not just stable.** A generic value —
       `test-local-1`, `local-app` — is a collision with the user's own other
       project: the second sync overwrites the first project's connection, and
       that project's purchases arrive nowhere afterwards. The script puts a
       random tail on every id it derives (`local-my-app-diw2hvnz73`). **If you
       ever set one by hand (`--domain`), put random characters in it yourself.**
     - **`product_ids` says which products the connection covers** (comma
       separated, `111,222,333`; Digistore24's default is `all`). `ds24-sync`
       sends the ids out of `config/digistore-products.json`, so the connection
       stays on this app's products — a vendor account usually holds more than
       this app. `all` is safe too (an unknown product is recorded and grants
       nothing), it just does not separate. Force either with
       `node run.mjs ds24-ipn --auto --products 111,222 --apply`.

   Only needs the `DIGISTORE_API_KEY` from step 1, no browser, no user input.
   `node run.mjs ds24-sync` **applies** — a preview that changes nothing is
   `node run.mjs ds24-sync --dry-run`.

   - **The thank-you page goes through the redirect while you develop.**
     Digistore24 stores public https URLs only, so `http://localhost:3000/optin/…`
     is handed over as
     `https://ds24-appkit.com/redir/?port=3000&path=/optin/[ORDER_ID]`
     — the buyer's browser is sent back to the local app from there. This is
     automatic (`scripts/ds24/_public-url.mjs`, `lib/digistore/public-url.ts`).
     If the user asks why a foreign domain is on their product: that is why, and
     it disappears by itself as soon as `APP_URL` is a real domain.
   - **IPN needs a public https URL** (Digistore24 calls it to verify it —
     localhost doesn't work, and the redirect above does not help here: it needs
     a browser, and the IPN is a server-to-server call). The IPN part follows
     `APP_URL`:
     - If `APP_URL` is a public https domain (live), the IPN gets set up on it.
     - Otherwise (local development) `ds24-sync` **opens a free Cloudflare Quick
       Tunnel by itself**, registers it as the IPN address and prints what it
       did. Nothing else to do — a local purchase works right away. The tunnel
       runs in the background; `node run.mjs status` shows it, `node run.mjs stop` ends it.
       **Tell the user their machine is reachable from the internet while it
       runs** — they must not learn that from a log line later.
     - It only skips when it truly cannot: app not running, or `cloudflared`
       not installed (the message names which). That is not an error in the
       sync — the products are done. Fix what it named and run it again.
     - `node run.mjs ds24-tunnel` does the same on its own, without touching products.
     - Do not set `APP_URL` to the tunnel address: that switches off the
       development login and locks the user out of their own app.
   - Prices do **not** belong on the DS24 product: the API discards
     `data[amount]` ("*is deprecated — create a payment plan instead*").
     `priceCents` and `billingInterval` go along at checkout as
     `payment_plan[...]` instead (`lib/digistore/checkout.ts`). So **no**
     payment plans are needed in the DS24 interface.
   - There *is* a `createPaymentPlan` API — we deliberately do not use it. A
     stored plan would put the price in a second place, and it cannot do free
     trials, upgrades/downgrades, vouchers or per-link affiliate commissions.
     Those only work when the plan travels with the checkout call. If the user
     asks why: one price, one place.
   - If the bundled plan list doesn't fit the user's product yet, edit
     `config/digistore-products.json` first (one entry per plan), then sync.
     Don't create a second price list in the code.
3. **Check the connection:** as soon as the IPN is set up, the user can trigger
   "Test connection" in Digistore24. A validly signed IPN is answered with
   `200`; with an invalid signature it's `403`.

   **On a `403`, do not start guessing** — `node run.mjs ds24-ipn-verify` answers
   it. The IPN log keeps the raw body of every call, so the script recomputes the
   signature over exactly what arrived: once with our canonical rule
   (`lib/digistore/ipn.ts`) and once with each known variant. The variant that
   matches names the rule Digistore24 actually used; if none matches, the
   passphrase is the suspect and not the code. `--order ABC123` picks a specific
   purchase, `--all` walks every rejected one.

   **"The purchase went through and nothing happened in the app" is a different
   sentence, and you can answer it yourself** — do not ask the user to look in
   their Digistore24 backoffice:

   ```bash
   node run.mjs ds24-purchase --order ABC12345      # --json for the full payload
   ```

   `getPurchase` returns Digistore24's own view of that order — status, product,
   buyer, billing type, next payment, invoice/cancel links. It reads only. Two
   outcomes, two different faults:
   - **Digistore24 does not know the id** → there was no purchase, or it was
     made in a different vendor account than this `DIGISTORE_API_KEY`. Nothing
     in the app is broken.
   - **Digistore24 knows it, `/dashboard/admin/purchases` does not** → paid, and
     no IPN reached this app. Look at the connection, in this order: is the
     registered URL still answering (a closed tunnel is the usual cause), did
     another project overwrite the `domain_id`, is this product in the
     connection's `product_ids`? `node run.mjs ds24-ipn --auto --apply`
     re-registers it.
4. **Test a purchase from the app (before the approval):** new products are
   initially **not approved** at Digistore24 — then only **test purchases** are
   possible. So that the vendor can run through the real checkout from within
   the app, they set the test-purchase cookie once, following this DS24 guide:
   <https://help.digistore24.com/hc/de/articles/23901169396241>. The approval
   (`node run.mjs ds24-approval --apply`, sets `approval_status = pending`;
   reseller derived automatically from the language — German → 1, otherwise USA
   → 2) is only requested once the product description and the app are mature —
   a go-live step (skill `go-live`).

## Generating checkout links (with cache)

There are **two paths**, and `/plans` uses both (`app/plans/page.tsx`):

- **Signed in → built on click.** A button posts to a server action
  (`app/plans/actions.ts`), which calls `ensureCheckoutToken(memberId)` and
  then `checkoutLinkFor(def, { buyer, customTracking: buildIdentity({...}) })`.
  The identity travels to Digistore24 in `tracking[custom]` and comes back on
  every later event, which is how the payment finds its owner even when the
  buyer pays under a different address. Nothing is requested from Digistore24
  while the page renders.
- **Signed out → the shared cached link.** `checkoutLinksFor` maps registry
  entries onto offers, sets the thank-you URL (`/optin/[ORDER_ID]`) and returns
  `{ url }` or `{ url: null, blocker }` so a page never renders a dead link.

`getOrCreateBuyUrl` (`lib/digistore/buyUrl.ts`) is the layer underneath. All of
it needs a **`writable`** key.

A complete custom payment plan travels with the call — one base product per
plan is enough, price/currency/interval are decided by the app at runtime.

- URLs are **cached for 20h** per offering (table `buy_url_cache`).
- **If the offering changes** (price, title, interval …), a new URL is generated
  automatically (`offerHash`).
- User-specific URLs are **never** cached: buyer/affiliate/upgrade, and any
  URL whose `tracking[custom]` names a Member (`m:…;t:…`).

Details & example: `docs/digistore-createbuyurl.md`.

## One-off setup via script (idempotent)

Some steps don't belong in the runtime app. That's what the scripts under
`scripts/ds24/` are for (Node ESM, dry run by default, `--apply` to execute).
The two common ones run conveniently through `make` (see the steps above):

- **Products + IPN (the normal case):** `node run.mjs ds24-sync`.
  Synchronizes the entire plan list from `config/digistore-products.json`
  (idempotent, writes the `productId` back) **and** registers the IPN connection
  via API (`ipn-setup.mjs --auto`, only with a public `APP_URL`). That is the
  route from step 2 — use it. This target applies by itself; the preview is
  `node run.mjs ds24-sync --dry-run`.
- **A single product (special case):** `node scripts/ds24/create-product.mjs
  --saas "…" --plan "…" --apply`. Only needed if you deliberately want to
  create a single product outside the registry; normally take `ds24-sync`.
- **IPN on its own (special case):** `node run.mjs ds24-ipn --url
  https://YOUR-DOMAIN/api/ipn --domain 'YOUR-DOMAIN' --apply` (idempotent via
  the `domain_id`). Only needed if you want to set up the IPN deliberately
  outside of `ds24-sync` or with a fixed URL/domain. DS24 generates the SHA512
  passphrase in the process → it gets written into the `.env` as
  `DIGISTORE_IPN_PASSPHRASE`, or pass an existing one via `--passphrase`.
  Prerequisite: `DIGISTORE_API_KEY` in the environment.

See `scripts/ds24/README.md`.

## Next step

Should the app bill **recurring (subscription) or by usage (prepaid tokens)**?
Then **`billing-modes`** now — it sets up subscriptions (monthly/yearly),
prepaid tokens with auto top-up (`createBillingOnDemand`) and the subscription
self-service (cancel, payment details, invoices).

After that, before the launch, in this order: **`ux-gateway`** (the experience —
now that there is a checkout, the first five minutes can be checked) →
**`security-gateway`** (security) → **`performance-gateway`** (scaling) →
**`compliance-check`** (legal) → **`go-live`** (putting it online) →
**`go-to-market`** (marketing).

## Important rules

- **Signature verification is mandatory and fail-closed.** Without a valid
  SHA512 signature an IPN is rejected with `403`. Never loosen that check.
- **No demo/mock fallback.** If an API call fails, an error is thrown — a failed
  checkout must never count as a success.
- **API key & passphrase are secrets.** They live in the `.env` (in STAGING/PROD
  in the hoster's secret management) and are read exclusively through
  `lib/digistore/settings.ts` — never in the code, in the repo or in logs.
  `ds24ApiKey()` throws if the key is missing; no silent fallback.
- Field reference (IPN payload, events, createBuyUrl parameters, the API
  functions and which key each one needs): `docs/digistore-integration.md`,
  `docs/DEPLOY.md` and the comments in `lib/digistore/`. The authoritative
  sources are Digistore24's own — the event/payload list at
  <https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events> and the
  API reference at <https://www.digistore24.com/api/docs/index.html>. Look there
  rather than guessing a field name.
