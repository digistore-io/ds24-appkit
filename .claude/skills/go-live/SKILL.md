---
name: go-live
description: Brings the app online (deployment) and verifies that everything works live. Guides through the pre-flight check, choosing a host (Railway/Render/Fly), environment variables/secrets, database migration in production, the Digistore IPN on the live domain, a smoke test and a re-check of security/performance against the live instance. Use this when the app is built, secured and scaled — before marketing.
---

# Go-Live — putting it online and verifying it

Goal: get the app **reliably live** and prove that the purchase-to-access flow
works in production. Guide the user step by step; they do not have to know
anything technical by heart.

## 1. Pre-flight (before the deploy)

- **Green locally:** `node run.mjs test` (typecheck + tests) and `node run.mjs build` without
  errors. Run them yourself — do not hand the commands to the user.
- **Env complete:** `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), `DATABASE_URL`
  (managed Postgres), `APP_URL` (= live domain), at least one auth provider.
  All of them listed in `.env.example`. Plus `DIGISTORE_API_KEY` and
  `DIGISTORE_IPN_PASSPHRASE` — written into the `.env` locally by
  `node run.mjs ds24-connect`, for PROD stored as secrets at the host.
  (`DIGISTORE_DEVELOPER_KEY` is optional — the connect flow works without it.)
- **Migrations ready:** `drizzle/` up to date (`npm run db:generate` after schema changes).

## 2. Hosting

- Choose a host: **Railway / Render / Fly.io** + **managed Postgres**. Step by
  step see [`docs/DEPLOY.md`](../../docs/DEPLOY.md).
- Set the env variables/secrets at the host (not in the code!).
- Deploy. Start: `npm run start`.

## 3. Database in production

- After the first deploy, migrate once: `npm run db:migrate`
  (i.e. against the prod `DATABASE_URL`).

## 4. Digistore: products, approval & IPN on live

All environments use **the same live products** (see `docs/environments.md`).
Once, before selling:

1. **Sync the products + IPN** (from `config/digistore-products.json`) — **you
   run this**, do not hand the command to the user:
   `node run.mjs ds24-sync`
   → creates them via `createProduct` / updates them via `updateProduct`, writes
   the `productId`(s) back into the config **and** registers the IPN. Do not
   call `node scripts/ds24/sync-products.mjs` directly: that skips the IPN, and
   purchases then unlock nothing.
2. **Nothing to do about prices.** Price, currency and interval live in
   `config/digistore-products.json` and travel with the checkout call as
   `payment_plan[...]`. Do **not** create payment plans in the DS24 interface —
   a second price would only drift from the first.
3. **Request approval:** `node run.mjs ds24-approval --apply`
   → sets `approval_status = pending` per product (via `updateProduct`). The
   reseller/marketplace follows from the language: German → Germany reseller
   (id 1), otherwise USA (id 2). For the English variant `--lang en --apply`,
   for a specific marketplace `--siteowner <id> --apply`. Products can
   only be sold publicly once Digistore24 has approved them. Only request
   approval when the product description and the app are mature.

   > **Test first — without approval only the test purchase works.** As long as a
   > product is not approved, only **test purchases** are possible. So that you can
   > play through the purchase-to-access flow from inside the app, the vendor sets
   > the test-purchase cookie once (instructions from Digistore24):
   > <https://help.digistore24.com/hc/de/articles/23901169396241>.
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
- Test the sign-in (Google/e-mail).
- **Purchase flow:** trigger "test connection" in Digistore24 (IPN `connection_test`
  → 200) and play through a real/test purchase → the order shows up, access is
  unlocked.
- Custom domain + HTTPS active.

## 6. Checking security & performance against LIVE

- Run **`security-gateway`** and **`performance-gateway`** once more against the
  live instance (a real load test against the live URL, `-c 100`).
  Only when that is green is "live" really finished.

## 7. Safeguards

- Know the rollback path (roll the previous deploy back at the host).
- Backups of the production DB enabled.

## Principles
- **Test live first, then advertise.** Do not market anything that is not verified live.
- **Secrets only at the host**, never in the code/repo.

Next step after a successful go-live: **`go-to-market`** (marketing).
