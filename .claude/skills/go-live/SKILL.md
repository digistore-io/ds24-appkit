---
name: go-live
description: Brings the app online and proves that a purchase really unlocks access. Runs the pre-flight check, hands the hosting itself to setup-hosting (host, CLI, secrets, managed Postgres, migration hook, domain), then does the live part — Digistore products and approval, the IPN on the live domain, a smoke test, a test purchase and a re-check of security/performance against the live instance. Use this when the app is built, secured and scaled — before marketing.
---

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
- **Migrations ready:** `drizzle/` up to date (`npm run db:generate` after schema changes).
- **Legal pages there?** If `compliance-check` has not run, it belongs before
  the launch, not after.

## 2. Hosting → **`setup-hosting`**

Start that skill and let it finish. It picks the host with the user (Railway,
Render, Fly.io or DigitalOcean), says what it costs before anything is booked,
installs the CLI, authenticates, creates the app and the managed Postgres, sets
every environment variable, wires `npm run db:migrate` into the deploy and puts
a domain on it. The reference behind it is [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

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
  live instance — the full pass in each, and this time the `host` check has
  something to look at and the load test runs against the live URL at `-c 100`.
  Both write a dated report into `docs/reports/`; that pair is the record that
  the launch was checked. Only when they are green is "live" really finished.

## 7. Safeguards

- Know the rollback path (roll the previous deploy back at the host).
- Backups of the production DB enabled.

## Principles
- **Test live first, then advertise.** Do not market anything that is not verified live.
- **Secrets only at the host**, never in the code/repo.

Next step after a successful go-live: **`go-to-market`** (marketing).
