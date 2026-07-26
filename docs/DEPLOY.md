<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Deployment — putting the app on a server

This is the reference. The guided way through it is the skill **`setup-hosting`**
(`node run.mjs`-driven, it does the work and hands the user the two or three
things only they can do). Read this when you want to know *why* a step is there,
or when you are doing it by hand.

## What this app needs from a host

Four things, and they are what rules most hosts in or out:

1. **Node ≥ 20 and a process that keeps running.** The app schedules its own
   jobs while it is up (`docs/cron.md`) and holds a database pool. A platform
   that freezes the process between requests breaks both — see the warning about
   free tiers below.
2. **A Postgres it can reach**, with a connection string. Managed is the point
   here: nobody building their first SaaS should also be running a database.
3. **A public https domain.** Not a nicety — Digistore24 refuses to store any
   other kind of URL, so without one there is no IPN and no purchase reaches the
   app.
4. **Somewhere to put secrets** that is not the repository.

Two things it does **not** need, and it is worth knowing before somebody sets
out to build them: **no Docker** (the hosts below build it themselves) and **no
special production build**. `npm run build` and `npm run start` are the whole
contract. `output: "standalone"` is available in `next.config.ts` and switched
off deliberately — it only pays for itself when you build your own image.

**`npm run db:migrate` runs in production.** It uses the migrator from
`drizzle-orm`, a runtime dependency, so it still works in an image that dropped
its devDependencies — which every one of these hosts does. (It used to be
`drizzle-kit migrate`, and that one is gone from the image by the time you need
it. If you read that instruction in an older copy of this file, this is what
changed and why.)

## The four hosts

All four deploy from a GitHub repository, all four give you a managed Postgres,
all four give you an https subdomain to start with. They differ in what the
agent can do for the user and in what breaks quietly.

| | **Railway** | **Render** | **Fly.io** | **DigitalOcean** |
|---|---|---|---|---|
| Setting it up | dashboard or CLI | dashboard | **CLI** (`fly launch`) | dashboard or CLI |
| Agent can drive it end-to-end | mostly | partly | **yes** | mostly |
| Migration before the new version starts | pre-deploy command | pre-deploy command *(paid plans)* | `release_command` | `PRE_DEPLOY` job |
| Where the money goes | app + usage-billed database | app + database, both per plan | app is cheap, **the database is not** | app + database, both per plan |
| The trap | usage billing has no ceiling | **the free tiers** (below) | check the database price first | pick the region twice |

### What it costs — look it up, never quote it from memory

**There are deliberately no prices in this repository.** They change, a stale
number in a document is worse than no number (somebody budgets on it), and the
one thing that must be right is the figure the user hears *before* they book
anything.

So: **read the host's own pricing page at the time**, and give one rough monthly
estimate for what this app actually needs — **one small always-on instance plus
one small Postgres**. Both parts, not just the app; the database is regularly the
larger half, and on one of the four it is several times the app.

Two things about the shape of it are stable enough to say without looking:

- **The four are not in the same price bracket.** Three land close together;
  **Fly.io's managed Postgres is the outlier by a wide margin**. Do not recommend
  Fly without pricing its database first — the deploy experience is the best of
  the four, and that is exactly why somebody ends up there without noticing.
- **Nothing here is free**, and the free tiers that exist are not a saving (next
  section).

**Which one?** If the user has no opinion: **Railway** — shortest path, and no
surprise on the database. **Fly.io** if the agent should do everything and the
user nothing, once the database price has been named and accepted; a sensible
middle is the app on Fly.io with the database elsewhere (see its section).
Render is the one to be careful with, DigitalOcean the one to pick if the user
is already there.

### The free tiers, and why this app should not be on one

Two of them will happily hand you something free, and both fail in a way that
looks like a bug in your app three weeks later:

- **A web service that spins down when idle.** Render's free plan stops the
  process after **15 minutes** without traffic, and waking it up takes about a
  minute. With the process stop the scheduled jobs — the ones that delete buyer
  data after 60 days (`docs/cron.md`) — and a Digistore24 IPN that runs into a
  minute of cold start is a purchase that unlocked nothing.
- **A database that expires.** Render's free Postgres expires **30 days after
  creation**, with a 14-day grace period to upgrade it; after that Render
  deletes it *and all of its data*. That is customers, orders and grants, gone
  on a date nobody wrote down.

Say this once, plainly, and let the user decide. It is their money and their
risk — but nobody should discover either of these from a support mail.

## What has to be in the environment

Everything below is set **at the host**, never in the repository. The values are
the ones from `.env.example`; `.env` itself is never deployed.

**Required — the app refuses to start without them** (`lib/env-guard.ts` checks
this at startup and aborts, deliberately, rather than running an app nobody can
sign in to):

| Variable | Value |
|---|---|
| `DATABASE_URL` | from the host's Postgres — usually injected for you |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AUTH_TRUST_HOST` | `true` — all four run the app behind a proxy |
| `APP_URL` | the live domain, `https://…`, no trailing slash |
| `APP_ENV` | `production` (or `staging`) |
| **mail — one of the two** | `POSTMARK_SERVER_TOKEN` + `POSTMARK_SENDER`, **or** `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` |
| `EMAIL_FROM` | the sender address |

> **Mail is not optional in production, and this is the mistake that costs the
> first deploy.** In DEV you can sign in without it (the development login); in
> STAGING and PROD that route does not exist, because it is an auth bypass. So an
> app deployed without a mail transport starts, checks, and stops with
> `✗ Startup aborted`. Set it up *before* the first deploy —
> `node run.mjs mail-setup` walks through it locally, `docs/auth-setup.md` has
> the detail.

**Required as soon as the app sells anything** — written into the local `.env`
by `node run.mjs ds24-connect` and `node run.mjs ds24-sync`, and copied from
there to the host:

`DIGISTORE_API_KEY` · `DIGISTORE_IPN_PASSPHRASE` · `DIGISTORE_IPN_DOMAIN_ID`

**Optional, by what the app does:**

| Variable | When |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | sign-in with Google (`docs/auth-setup.md`) |
| one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | the assistant or any other AI task (`docs/ai-providers.md`) |
| `CRON_SECRET` | only if the host does the timing instead of the app (below) |
| `APP_TIME_ZONE` | the zone dates are rendered in (default `Europe/Berlin`) |
| `DB_POOL_MAX` | lower than 10 on a small database — see the note under Railway |
| `NEXT_PUBLIC_APP_NAME` | the app's name in the interface |

> **`NEXT_PUBLIC_…` is baked in at build time, not read at run time.** Setting it
> after the build changes nothing and looks like the host ignoring your variable.
> Set it before the build, then redeploy.

## Migrations — the step to get right once

The rule: **the schema is migrated before the new version serves a request.**
Every host below has a hook for exactly that, and using it is the difference
between a deploy and an outage — a new version querying a column its migration
has not created yet answers 500 to everybody.

The command is always the same:

```
npm run db:migrate
```

It is idempotent (it applies what has not run yet and nothing else), it is safe
to run twice, and it is safe to run while the old version is still serving —
provided the migration itself is written that way. `docs/database.md` has the
two rules for that: new columns nullable or with a default, and a removal only
after the version that stopped using them is live.

**After the very first deploy there is nothing else to do.** The database is
empty, the migration creates everything, and the first person to sign in becomes
a customer — **not** an operator. So create the operator account yourself,
before you announce the app:

```
node run.mjs user-create --email you@example.com --role owner --apply
```

against the production `DATABASE_URL`. (The "first account becomes owner" rule
is DEV-only, on purpose: a fresh production database is empty in exactly the
same way, and there the first person through the door is a stranger.)

---

## Railway

**What the user books:** a Railway account (GitHub sign-in), then the **Hobby**
plan — Railway has no free tier that runs anything permanently. Postgres is a
service inside the same project, billed by usage.

**How the agent gets in:**

```
node run.mjs doctor --deploy     # names the install command for THIS system
railway login                    # opens the browser — the user confirms, once
railway whoami                   # proof it worked
```

For a machine that has no browser, the user creates a token in the dashboard
(*Account Settings → Tokens*) and it travels as an environment variable:

```
RAILWAY_TOKEN=…  railway status
```

**The deploy:**

1. `railway init` (or *New Project → Deploy from GitHub repo* in the dashboard).
2. Add Postgres: `railway add --database postgres`. **The app does not get
   `DATABASE_URL` from this by itself** — the database is a service of its own,
   with its own variables, and the app service has to point at it:

   ```
   railway variables --set "DATABASE_URL=${{Postgres.DATABASE_URL}}" --service <app>
   ```

   That is a **reference**, not a copy: it resolves at deploy time, so it still
   holds after the database is rotated or moved. Pasting the literal string is
   the version that works today and breaks quietly later. (`Postgres` is the
   database service's name — `railway status` shows what yours is called.)
3. Variables: `railway variables --set "AUTH_SECRET=…" --set "APP_ENV=production"`
   … — everything from the table above. Quote each pair; several of these values
   contain characters a shell would otherwise eat.
4. Set the **pre-deploy command** to `npm run db:migrate` (service → *Settings →
   Deploy*). This is the migration hook; without it you are migrating by hand
   after every schema change, and one day you will forget.
5. `railway up`, or push to the connected branch.
6. Domain: *Settings → Networking* gives you a `…up.railway.app` to start with;
   a custom domain is a CNAME. Put whichever one is final into `APP_URL`.

**Two Railway-specific things.** Usage billing has **no ceiling by default** —
set a spend limit in the dashboard on day one. And its Postgres plans are small
on connections; if the app logs `too many clients`, set `DB_POOL_MAX=5`.

## Render

**What the user books:** a Render account, a **Starter** web service (not Free —
see above) and a **paid Postgres** (the free one expires after a month).

**How the agent gets in:** it largely does not, and that is the honest answer.
Render is set up in the dashboard; the user clicks. There is an API and a CLI,
but the first-time setup is a browser flow (authorising GitHub, picking plans),
so plan for guiding rather than doing.

**The deploy:**

1. *New → Web Service* → connect the repo.
   - Build command: `npm ci && npm run build`
   - Start command: `npm run start`
2. *New → Postgres*, then copy its **Internal Database URL** into the web
   service as `DATABASE_URL`. Internal, not external: same data centre, no
   public hop, and no SSL to configure.
3. Environment: everything from the table above, under *Environment*.
4. **Pre-Deploy Command:** `npm run db:migrate`. It exists on paid instance
   types only — one more reason Free is not a saving here. On a plan without it,
   run the migration in the shell after each deploy that carries a schema change,
   and know that this is the manual step you will eventually skip.
5. Domain: `…onrender.com`, or a custom one under *Settings → Custom Domain*.
   Into `APP_URL`.

## Fly.io

The one the agent can do end to end, because everything is a command — and the
one where the database costs real money. Read the next paragraph before
recommending it.

**What the user books:** a Fly account with a payment method. The app itself is
cheap — a shared-CPU machine, no plan to choose up front. **The database is
not.** Fly's Managed Postgres has no small entry plan the way the other three
do; its cheapest tier is a real managed database with high availability, backups
and connection pooling, and it is priced like one. **Look up the current MPG
price before you recommend Fly at all**, and say it out loud.

Three honest options, and the user picks:

| | |
|---|---|
| **Fly app + Fly MPG** | everything in one place, everything scriptable, backups and failover included — and the most expensive of these four combinations by some way |
| **Fly app + an external Postgres** (Neon, Supabase) | keeps the part that makes Fly nice — the deploy — and drops the part that makes it expensive. Put the connection string in `DATABASE_URL` by hand and skip step 2 below |
| **Another host entirely** | if the database price is the deciding factor, Railway is the shorter path anyway |

**Never the unmanaged one as a way to save money.** `fly postgres create` makes a
Postgres *you* operate: Fly says plainly it offers no support for it, and
scaling, version upgrades, security patches, off-site backups and outage
recovery are yours. For somebody launching their first SaaS that is not a
cheaper database, it is an unpaid second job with their customers' data on it.

**MPG is not in every region.** The list is shorter than Fly's app regions and
is being extended; check it before choosing one (`fly mpg create` offers what is
available). If the user's region is not among them, that is an argument for the
external database, not for putting the app somewhere far from its data.

**How the agent gets in:**

```
node run.mjs doctor --deploy     # names the install command for THIS system
flyctl auth login                # browser, once
flyctl auth whoami
```

Headless: the user creates a token (`flyctl tokens create deploy`, or in the
dashboard) and it travels as `FLY_API_TOKEN`.

**The deploy:**

1. `fly launch` — detects Next.js, writes a `Dockerfile` and a `fly.toml`, and
   asks about a database. Say **no** to Postgres here and decide it in step 2 on
   purpose, with the price on the table, rather than accepting what the wizard
   picks.
2. Postgres, if it is to be Fly's:
   ```
   fly mpg create --name my-saas-db --region fra --plan basic --volume-size 10
   fly mpg attach <cluster-id> -a my-saas
   ```
   `attach` **sets `DATABASE_URL` on the app itself** — there is no string to
   copy. It sets the *pooled* URL (PgBouncer), which is the right default: the
   app opens its own pool on top, and a pooler in front of a 1 GB database is
   what keeps a handful of app instances from exhausting its connections.
   Same region as the app, both times.

   With an external database instead, skip this step and set the connection
   string as a secret in step 3 like any other value.
3. Secrets — one command, and they are encrypted at rest:
   ```
   fly secrets set AUTH_SECRET=… APP_ENV=production APP_URL=https://… \
     POSTMARK_SERVER_TOKEN=… POSTMARK_SENDER=… EMAIL_FROM=… \
     DIGISTORE_API_KEY=… DIGISTORE_IPN_PASSPHRASE=… DIGISTORE_IPN_DOMAIN_ID=…
   ```
4. **The migration hook** — into `fly.toml`, and this is the piece `fly launch`
   does not write for you:
   ```toml
   [deploy]
     release_command = "npm run db:migrate"
   ```
   It runs in a one-off machine before the new version takes traffic. A failing
   migration cancels the release instead of publishing a broken app.
5. `fly deploy`. Then `fly logs`, and `fly status` for what is running.
6. Domain: `…fly.dev` to start with; `fly certs add your-domain.com` for your
   own, after pointing the DNS at it.

**Check the generated Dockerfile once.** `fly launch` writes it from what it
finds, and it prunes devDependencies for the runtime image — which is fine here
(`next`, `drizzle-orm` and `postgres` are all runtime dependencies), but it is
worth a look rather than a hope.

**If the app logs `prepared statement "…" already exists`, the pooler is why.**
`fly mpg attach` hands over the pooled URL, and a PgBouncer pooling per
transaction can hand two statements of one prepared query to two different
backend connections. This app talks to Postgres through `postgres.js`, which
prepares by default. Two ways out, in this order: the app's own pool is small
enough not to need the pooler (`DB_POOL_MAX=5` and the **direct** connection URL
from the MPG dashboard), or `prepare: false` on the client in `db/index.ts`.
Current PgBouncer versions support prepared statements in transaction mode, so
this may never appear — it is here because when it does, it appears in
production, under load, and reads like a bug in the app.

## DigitalOcean App Platform

**What the user books:** a DigitalOcean account, an **App Platform** app on the
Basic plan, and a database. Two shapes: a **dev database** (single node, cheapest,
fine to start) or a **managed Postgres cluster** (more expensive, backups and
failover). Both are created alongside the app.

**How the agent gets in:**

```
node run.mjs doctor --deploy     # names the install command for THIS system
doctl auth init                  # asks for a Personal Access Token
doctl account get
```

The token is the one thing only the user can produce: **API → Tokens →
Generate New Token**, scope *write*. It goes into `doctl auth init` or into
`DIGITALOCEAN_ACCESS_TOKEN` — and nowhere near the repository.

**The deploy.** App Platform is described by a spec file, which is the part
worth having in the repo — the dashboard flow is the same thing with more
clicking. Write `.do/app.yaml`:

```yaml
name: my-saas
region: fra                      # the same region as the database
services:
  - name: web
    github:
      repo: YOUR-NAME/YOUR-REPO
      branch: main
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: npm run start
    instance_size_slug: apps-s-1vcpu-0.5gb
    instance_count: 1
    http_port: 8080
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}     # the binding — never a pasted string
      - key: APP_ENV
        value: production
      - key: AUTH_TRUST_HOST
        value: "true"
      - key: AUTH_SECRET
        value: …
        type: SECRET
jobs:
  - name: migrate
    kind: PRE_DEPLOY               # runs before the new version takes traffic
    github:
      repo: YOUR-NAME/YOUR-REPO
      branch: main
    build_command: npm ci
    run_command: npm run db:migrate
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
databases:
  - name: db                       # this name is what ${db.DATABASE_URL} refers to
    engine: PG
    version: "16"
    production: false              # false = the cheap dev database; true = a managed cluster
```

Then `doctl apps create --spec .do/app.yaml`, and afterwards
`doctl apps update <id> --spec .do/app.yaml`.

**Four DigitalOcean-specific things:**

- **`http_port` must match.** App Platform routes to the port it is told;
  `npm run start` listens on `PORT`, which the platform sets. Leave both alone
  and they agree — the number above is only there because the spec wants one.
- **Pick the region twice, the same both times.** An app in Frankfurt talking to
  a database in New York works, and is slow in a way that looks like your code.
- **Secrets go in as `type: SECRET`**, which encrypts them; without it the value
  sits readable in the app spec, and the spec is in your repository.
- **Its Postgres requires SSL.** The connection string DigitalOcean hands over
  carries `?sslmode=require`, and the app honours what the URL says. Take the
  string as given — trimming the parameter is how you get a connection refused
  on the first request and not before.

---

## Connecting Digistore24

1. `node run.mjs ds24-connect` in the terminal. The browser opens, the user
   confirms at Digistore24 — the API key lands in the local `.env`
   (`DIGISTORE_API_KEY`). There is deliberately **no** UI for entering keys.
2. Set `APP_URL` to the live domain, then `node run.mjs ds24-sync`. It creates
   the products **and** registers the IPN connection via API (the URL is always
   `https://YOUR-DOMAIN/api/ipn`, signature SHA512). The generated passphrase and
   the stable `DIGISTORE_IPN_DOMAIN_ID` are written into the `.env`. Nothing has
   to be entered by hand in the Digistore24 interface.
3. Copy those three values into the host's secrets:
   `DIGISTORE_API_KEY`, `DIGISTORE_IPN_PASSPHRASE`, `DIGISTORE_IPN_DOMAIN_ID`.
4. Trigger "test connection" in Digistore24 → the IPN must answer `200`.

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

   - **Railway / Render / Fly / DigitalOcean:** a cron job running
     `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://YOUR-DOMAIN/api/cron`.
   - **A plain server / crontab:** the same `curl` line — or, with database
     access and no running app, `node run.mjs db-prune-ai` and
     `node run.mjs db-prune-ipn`.

Without `CRON_SECRET` the endpoint refuses to run (503, fail closed), so it can
never be left open as a "delete my data" URL. The in-app scheduler needs no
secret — it is not making a request.

## Proving it works

A deploy that finished is not a deploy that works. In order:

```
https://YOUR-DOMAIN/api/healthz      → {"status":"ok"}
https://YOUR-DOMAIN/api/readyz       → ready   (this one talks to the database)
node run.mjs smoke --url https://YOUR-DOMAIN
```

Then by hand, because no script can: sign in, buy something (test purchase), and
check that the order arrived and the access was unlocked. `docs/environments.md`
explains why all environments share the same live products, and the skill
`go-live` walks the whole sequence.

## Where the secrets live

At the host, in its own secret storage, and nowhere else. Not in the repo, not
in `.env` on a server, not in an app spec that is committed, not in a chat
message. The hosting **token** — `RAILWAY_TOKEN`, `FLY_API_TOKEN`, the
DigitalOcean PAT — is the sharpest of them: it is not one app's secret, it is
the account. It belongs in the shell of whoever is deploying, for as long as the
deploy takes, and it is revocable at the host the moment it has been somewhere
it should not be.
