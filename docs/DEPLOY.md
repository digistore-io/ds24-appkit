# Deployment

The template builds a self-contained artifact (`output: "standalone"`) and runs
on any Node host. Here are the three simplest routes. Everywhere it holds that:

**Set these environment variables** (values from `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL` (your domain)
and at least one auth provider (`GOOGLE_*` or `AUTH_RESEND_KEY`+`EMAIL_FROM`).

After the first deploy, create the schema once: `npm run db:migrate`.
On every further deploy the migrations run **before** the new version starts —
background and rules: [`database.md`](database.md). `db:push` has no business
in production.

---

## Railway (simplest)

1. New project → "Deploy from GitHub repo" → pick your repo.
2. Add the **PostgreSQL** plugin → Railway sets `DATABASE_URL` automatically.
3. Enter the remaining env variables under *Variables*.
4. Deploy. Then `npm run db:migrate` in the Railway shell.

## Render

1. **New → Web Service**, connect the repo. Build: `npm install && npm run build`,
   Start: `npm run start`.
2. Create **New → PostgreSQL**, set its connection string as `DATABASE_URL`.
3. Enter the remaining env variables, deploy, then `npm run db:migrate`.

## Fly.io

1. `fly launch` (detects Next.js). Postgres: `fly postgres create` and
   `fly postgres attach` → sets `DATABASE_URL`.
2. Secrets: `fly secrets set AUTH_SECRET=… GOOGLE_CLIENT_ID=… …`
3. `fly deploy`, then `fly ssh console -C "npm run db:migrate"`.

---

## Connecting Digistore24

1. Run `node run.mjs ds24-connect` in the terminal. The browser opens, you confirm at
   Digistore24 — the API key ends up in your local `.env`
   (`DIGISTORE_API_KEY`, plus `DIGISTORE_IPN_PASSPHRASE`, as far as Digistore24
   supplies it). There is deliberately **no** UI for entering keys.
2. Run `node run.mjs ds24-sync`. Creates the products **and** registers
   the IPN connection with Digistore24 via API (URL always
   `https://YOUR-DOMAIN/api/ipn`, signature SHA512) — provided `APP_URL` points
   at the public domain. The generated passphrase and the stable
   `DIGISTORE_IPN_DOMAIN_ID` end up in the `.env`. In the DS24 UI, **nothing**
   has to be entered by hand for this.
3. Store the relevant secrets at the host (not in the repo):
   `DIGISTORE_API_KEY`, `DIGISTORE_IPN_PASSPHRASE`, `DIGISTORE_IPN_DOMAIN_ID`.
4. Trigger "test connection" in Digistore24 → the IPN must answer with `200`.

---

## Scheduled cleanup (IPN log)

The IPN log (`/dashboard/admin/purchases` → **IPN-Log**) keeps the full raw
payload of every incoming IPN so a rejected or mis-signed webhook can be
diagnosed after the fact. That payload contains buyer data, so it is **pruned
after 60 days** — you just have to schedule the prune.

1. Set a `CRON_SECRET` in the host's secrets
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Have the host's scheduler call the endpoint **once a day**:

   ```
   GET https://YOUR-DOMAIN/api/cron/prune-ipn-log
   Authorization: Bearer <CRON_SECRET>
   ```

   - **Railway / Render / Fly:** add a cron job (or a tiny scheduled service)
     that runs `curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
     https://YOUR-DOMAIN/api/cron/prune-ipn-log`.
   - **Vercel:** add it to `vercel.json` → `crons` (daily) and set `CRON_SECRET`.
   - **A plain server / crontab:** the same `curl` line in a daily cron entry —
     or, with database access, `node run.mjs db-prune-ipn` (no running app needed).

Without `CRON_SECRET` the endpoint refuses to run (fail closed), so it can never
be left open. To change the window, use `node run.mjs db-prune-ipn --days 30`
locally; the endpoint itself uses the 60-day default.
