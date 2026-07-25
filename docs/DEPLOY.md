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

## Scheduled cleanup

**There is nothing to set up.** The app schedules its own jobs while it is
running — see [`docs/cron.md`](cron.md). Two ship, both daily:

| Job | What it deletes | Window |
|---|---|---|
| `prune-ai-usage` | AI-usage rows — the cost history | 12 months |
| `prune-ipn-log` | IPN-log rows — raw webhook payloads, i.e. buyer PII | 60 days |

Both windows are one number in `config/cron.json`.

This used to be a manual step: an endpoint, and a line here telling you to point
your host's scheduler at it. It was the most skippable line in this document,
and skipping it left buyer data in the log for ever with nothing to say so.

**Two things to check after the first deploy**, because "it runs by itself" is
worth verifying once rather than assuming for a year:

```
GET https://YOUR-DOMAIN/api/cron?list
Authorization: Bearer <CRON_SECRET>
```

and the `[cron]` lines in the app's log. `last run: never` a week in means the
scheduler is not running — most likely the app is being restarted more often
than the interval, or `config/cron.json` has `"enabled": false`.

### If you would rather your platform did the timing

Some hosts stop a container between requests, and some Operators simply want the
cleanup at 03:00 and not "24 h after last time". Both are handled the same way:

1. `"enabled": false` in `config/cron.json` — the in-app timer stops, the jobs
   stay.
2. Set `CRON_SECRET` in the host's secrets
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. Have the scheduler call it once a day:

   ```
   POST https://YOUR-DOMAIN/api/cron
   Authorization: Bearer <CRON_SECRET>
   ```

   - **Railway / Render / Fly:** a cron job running
     `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://YOUR-DOMAIN/api/cron`.
   - **Vercel:** `vercel.json` → `crons` (daily), and set `CRON_SECRET`.
   - **A plain server / crontab:** the same `curl` line — or, with database
     access and no running app, `node run.mjs db-prune-ai` and
     `node run.mjs db-prune-ipn`.

Without `CRON_SECRET` the endpoint refuses to run (503, fail closed), so it can
never be left open as a "delete my data" URL. The in-app scheduler needs no
secret — it is not making a request.
