<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Environments: DEV · STAGING · PROD

The app runs in up to three environments. **All of them use the same live products on
Digistore24** (`digistore24.com`) — there is exactly **one** set of products and **one**
`productId` per offer (`config/digistore-products.json`). So environments do
**not** differ in the DS24 products, only in:

| What | DEV (local) | STAGING (optional) | PROD |
|-----|-------------|--------------------|------|
| `APP_URL` | `http://localhost:3000` | staging domain | live domain |
| `DATABASE_URL` | local Postgres (Docker) | staging DB | prod DB |
| Products / `productId` | **the same live products** | the same | the same |
| IPN target | Cloudflare Quick Tunnel → localhost | staging domain | live domain |
| Payments | **DS24 test purchases** | test purchases | real purchases |
| Mail delivery | optional | **mandatory** | **mandatory** |
| Sign-in without a mail account | **yes** (development sign-in) | no | no |

> Because all environments go against the live products, DEV/STAGING work with
> **Digistore24 test purchases** (test payment method) — no real money,
> but real products/IPNs.

`APP_ENV` (`development` | `staging` | `production`) does not only name the
environment — **hard rules** hang off it:

- **STAGING and PROD require mail delivery.** If it is missing, the server
  start aborts with an explanation (`instrumentation.ts` → `lib/env-guard.ts`).
  Better a clear error at deploy time than a running app that nobody
  can sign in to.
- **The development sign-in only applies in DEV.** If no mail delivery is
  configured, the sign-in page signs you in locally without a magic link and
  without a password, so you can get going right away. Four conditions have to
  hold at the same time for that: `APP_ENV`=development, `NODE_ENV`≠production,
  `APP_URL` on localhost, and no mail delivery. As soon as you run
  `node run.mjs mail-setup`, it disappears.
- **Unknown `APP_ENV` values count as `production`.** So a typo leads to the
  strictest environment, not to the loosest.

The concrete values come from the respective `.env` or from the host's secrets.

## Receiving IPNs locally (DEV) — Cloudflare Quick Tunnel

Digistore24 has to reach the IPN via HTTPS. Locally that works without extra
services through a **free Cloudflare Quick Tunnel** (no account, no domain):

```bash
node run.mjs start      # app on http://localhost:3000
node run.mjs ds24-sync  # products + IPN — opens the tunnel by itself if it needs one
```

`node run.mjs ds24-sync` notices that `APP_URL` is local, opens the public address onto
your running app and registers it at Digistore24 as the IPN endpoint (path
always `/api/ipn`). It announces that plainly: while the tunnel runs, your
machine is reachable from the internet. It runs in the **background** and
returns — no terminal of its own, no Ctrl-C. `node run.mjs status` shows it, `node run.mjs stop`
ends it along with the app and the database.

`node run.mjs ds24-tunnel` does the same on its own, without touching the products. An
already-running tunnel is reused by both, so the order never matters.

**`node run.mjs stop` ends the tunnel, `node run.mjs start` brings it back.** You do not have to
think about it: once an app has an IPN connection (`DIGISTORE_IPN_DOMAIN_ID` in
the `.env`), every `node run.mjs start` re-opens the tunnel and re-points Digistore24 at
it. An app that never received an IPN gets nothing — `node run.mjs start` does not put
your machine on the internet on its own — and with a public `APP_URL`
(STAGING/PROD) it never happens at all.

The address is **new every time**, and it has to be: a free quick tunnel gets a
random name on each start, and keeping one would need a Cloudflare account, a
named tunnel and your own domain. That is why the connection hangs off a stable
`domain_id` — every open updates the same connection instead of adding another.

Two things deliberately do **not** open a tunnel:

- `node run.mjs ds24-sync --dry-run` — a preview must not publish your machine.
- `node run.mjs ds24-sync --no-tunnel` — to get the old behaviour back.

If you want to do the registration yourself:

```bash
node scripts/ds24/ipn-setup.mjs \
  --url "https://<random>.trycloudflare.com/api/ipn" --apply
```

Notes:
- **`APP_URL` stays as it is** — deliberately. It is the address of your app,
  not of a temporary tunnel, and a non-local value there switches the
  development login off (`lib/auth/dev-login.ts`); you would suddenly be unable
  to sign in locally. The tunnel address goes to `ipn-setup.mjs` directly.
- The tunnel URL **changes on every start** — the next `node run.mjs ds24-tunnel` registers
  the new one by itself. The `domain_id` stays stable through that
  (`local-<projectname>`, in the `.env`), so the connection is updated instead
  of multiplied.
- A brand-new address takes half a minute or so to be reachable worldwide.
  Until then Digistore24 answers "http error 0" — `node run.mjs ds24-tunnel` knows that and
  simply tries again.
- DS24 always sends IPNs to **the URL set up most recently for the vendor**. For
  a dev session point the target at the tunnel, afterwards back to the
  live domain for PROD (or use a separate test vendor/sub-account).
- The IPN signature check (SHA512) applies locally too — `DIGISTORE_IPN_PASSPHRASE`
  in the `.env` has to match the DS24 setting.

## Products & go-live

Products are maintained **once** against the live products (not per environment):

```bash
node run.mjs ds24-sync     # create/update products AND register the IPN
# No payment plans in the DS24 UI: price and interval travel with each checkout
# call as a payment_plan. One price, one place — config/digistore-products.json.
node run.mjs ds24-approval --apply   # approval (approval_status=pending); reseller from language (DE→1, otherwise US→2)
```

Details on go-live: skill **`go-live`**.
