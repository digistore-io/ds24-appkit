# Digistore SAAS App Template

A starter template for **SAAS applications that bill through Digistore24** —
built so that you can extend it **together with Claude Code**, even without
programming experience.

**Stack:** Next.js 16 (App Router) · TypeScript · Drizzle ORM + Postgres ·
Auth.js v5 (email token, Google optional) · Tailwind v4 + shadcn/ui.

Wired up and ready to use:
- 🔐 **Sign-in** (email token/magic link via Postmark or SMTP; Google optional)
  — plus an **optional password** each customer may set on themselves, and
  locally you get straight in **without a mail account** (development login)
- 👥 **User management** with two roles (admin/user) — admins manage accounts
  under `/dashboard/admin/users`
- 🏷️ **Plan page** (`/plans`) with monthly/yearly subscription and token
  packages — hard-coded in `config/digistore-products.json`, to reshape or delete
- 🎚️ **One switch for what you sell** — `"billingMode": "subscriptions"` |
  `"tokens"` | `"both"` in the same file. It takes the surfaces of the model you
  don't use off the pages (no balance stuck at 0, no empty "next payment" card)
- 💳 **Digistore24 billing**: IPN webhook with **SHA512 signature check**,
  checkout link generation (`createBuyUrl`), API key hookup via
  `node run.mjs ds24-connect`, GDPR opt-in
- 🗄️ **Database** with an order state machine (paid/refunded/chargeback/…)
- 🩺 Health checks (`/api/healthz`, `/api/readyz`) for easy deployment

## Your path to a finished SaaS (with Claude Code)

Start Claude Code in the project and simply say what you want — the matching
**skills** (in the `.claude/skills/` folder) guide you step by step. Every step
hands over to the next:

| # | Step | Skill | What happens |
|---|---------|-------|--------------|
| — | **Set up the machine** | `setup-machine` | only if something is missing: installs Node/git after asking, prepares `.env`, database and migrations |
| 0 | **Find an idea** | `market-research` | interview about your expertise/reach → research the target audience → concrete product proposal |
| 1 | **Build the app** | `build-app` | pick an archetype, create the data model + pages |
| 2 | **Payment** | `setup-digistore` | connect Digistore24: `node run.mjs ds24-connect`, IPN, checkout links |
| 2b | **Subscriptions & tokens** *(optional)* | `billing-modes` | fixed subscriptions (monthly/yearly) and/or prepaid tokens with auto top-up + subscription self-service |
| 2c | **AI assistant** *(optional)* | `ai-chat-knowledge` | switch the in-app chat on, give her a name, and write the handbook she answers your customers from |
| 2d | **Which AI company** *(optional)* | `ai-providers` | pick OpenAI, Anthropic, Gemini, Mistral or OpenRouter, get the key in, bind each job to a model and set the prices the cost page reports |
| 2e | **AI interface (MCP)** *(optional)* | `mcp-server` | let your customers connect Claude to your app: decide which capabilities become tools, then switch it on |
| 3 | **Security** | `security-gateway` | scan the app for security holes and fix them |
| 4 | **Scaling** | `performance-gateway` | make sure ~100 concurrent users run smoothly |
| 5 | **Legal** | `compliance-check` | imprint/privacy policy/terms/right of withdrawal + GDPR |
| 5b | **The server** | `setup-hosting` | pick a host (Railway/Render/Fly.io/DigitalOcean), say what it costs, install its CLI, authenticate, app + managed Postgres, secrets, migration in the deploy, domain |
| 6 | **Live** | `go-live` | put the app online and verify it live — a real test purchase included |
| 7 | **Marketing** | `go-to-market` | positioning, channels, launch plan + ready-made content (landing page, emails, **video scripts**) |

While building (step 1), **tests are written and run automatically**
(`npm run test`) — locally, on your machine, before anything moves on.
Throughout, **`guardrails`** watches over money, secrets and customer data.

**Lost the thread? Ask the coach.** `coach` is the skill for the two questions
that come up between the steps — *"what is the next step?"* and *"how do I solve
this?"*. It looks at the project itself to work out where you got to, names the
one thing that comes next and starts it; and it takes a symptom (an error page,
a test purchase that never arrived, the assistant answering "I do not know") to
the place that fixes it. You never have to know a skill name:

> **"What's the next step?"**

**You don't have to remember any of this.** Start Claude Code in the project
folder and say:

> **"Build my app"**

That is the only door. Claude then asks you whether you already have an idea —
and if not, the two of you find one together (step 0). Everything else follows
step by step.

## What you need installed

The template runs on **Linux, macOS and Windows** — Claude Code does, so this
does too. The list is deliberately short:

| | Linux | macOS | Windows |
|---|---|---|---|
| **Node.js ≥ 20** (with npm) | package manager / [nodejs.org](https://nodejs.org) | `brew install node` | `winget install OpenJS.NodeJS` |
| **git** | usually present | `xcode-select --install` | [Git for Windows](https://git-scm.com/download/win) |
| **Docker** *(optional)* | [Docker Engine](https://docs.docker.com/engine/install/) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) (uses WSL2) |
| **cloudflared** *(optional)* | [pkg.cloudflare.com](https://pkg.cloudflare.com/) | `brew install cloudflared` | `winget install --id Cloudflare.cloudflared` |

Two things are genuinely needed: **Node.js and git**. The other two are not
prerequisites — Docker is used for the database *if you have it* (see below),
and `cloudflared` only if you want to receive real Digistore24 purchases on your
own machine while developing.

**No `make` is needed** — the commands run through `node run.mjs`, which works
in every shell. On **Windows** use **Git Bash** or **WSL2** (not PowerShell);
Git for Windows brings Git Bash with it, and Claude Code needs it there anyway.

**You don't have to install any of it by hand.** Start Claude Code in the
project folder and it checks the machine at the greeting; if something is
missing it walks you through it, asks before every install, and takes over the
parts it can do itself. The table above is only there so you know in advance
what is coming.

Want to look for yourself?

```bash
node run.mjs doctor
```

It says what is missing and how to install it on your system.

**No Docker? Then there is nothing to do.** On the first start the app looks at
your machine: if Docker is there and running, the database runs in a container —
if not, Postgres comes from an npm package instead (about 60 MB, downloaded
once). It is the same PostgreSQL 16, and every command behaves identically. The
choice is written into your `.env` as `DB_DRIVER` and then stays put, so your
database does not move around underneath you when Docker Desktop happens not to
start one morning. `node run.mjs doctor` tells you which of the two is in use.

## Quick start

```bash
claude             # start Claude Code in the project folder
```

Claude greets you and tells you how things continue. It takes care of setup,
database and starting the app together with you — you don't need to know any of
the commands below by heart.

### For developers: the commands directly

If you prefer to type yourself: `node run.mjs start` does everything in one go —
install dependencies, create `.env` from `.env.example`, start Postgres (in
Docker, or without it — see above), apply migrations, bring the app up
(→ http://localhost:3000).

`AUTH_SECRET` is generated for you on the first start. One thing you enter into
`.env` yourself afterwards: mail delivery for sign-in (Postmark **or** SMTP —
`node run.mjs mail-setup` walks you through it, details in
[`docs/auth-setup.md`](docs/auth-setup.md)).

Then `node run.mjs restart`.

The most important commands at a glance (`node run.mjs` alone shows them all):

| Command | What happens |
|---|---|
| `node run.mjs setup` | get everything ready without starting: `.env`, dependencies, database, migrations |
| `node run.mjs start` | start database + app (including migrations) |
| `node run.mjs stop` | stop app + database |
| `node run.mjs test` | tests (vitest) + TypeScript check |
| `node run.mjs smoke` | call every page once — finds "Internal Server Error" |
| `node run.mjs db-migrate` | apply pending database migrations |
| `node run.mjs db-reset` | wipe the local database, migrate anew, load the seed |
| `node run.mjs mail-setup` | set up mail delivery (Postmark or SMTP) + test mail |
| `node run.mjs ds24-connect` | fetch the Digistore24 API key (browser) and store it in `.env` |
| `node run.mjs logs` | follow the log of the running app |
| `node run.mjs doctor` | check that everything needed is installed |
| `node run.mjs` | show all commands |

Is something already running on port 3000 or 15432 (the database port) on your
machine? Then you don't have to do a thing: `node run.mjs start` takes the next free
port, writes it down and tells you which one it became. It remembers the app
port along the way, so that `node run.mjs stop`, `node run.mjs status` and
`node run.mjs smoke` hit the right one without being told. To force a particular
port: `node run.mjs start --port 3005`.

## Deployment

`npm run build` and `npm run start` — that is the whole contract, and it is what
**Railway, Render, Fly.io and DigitalOcean** all want, each with a managed
Postgres next to it. It costs money — a small server plus a small database, per
month, at every one of them. The free tiers are not suitable for a product that
takes money (a sleeping app server, an expiring database — both explained in the
doc), and what the paid ones cost today is something Claude looks up with you
before you book anything.

**You do not have to do this by hand.** Ask Claude Code for the skill
**`setup-hosting`**: it picks the host with you, says what it costs before you
book anything, installs the host's CLI, gets itself authenticated, creates app
and database, sets every secret, wires the migration into the deploy and puts a
domain on it. Step by step, and the reasoning behind each step:
[`docs/DEPLOY.md`](docs/DEPLOY.md).

The IPN URL is registered at Digistore24 automatically by
`node run.mjs ds24-sync` as soon as `APP_URL` is the live domain — always
`https://YOUR-DOMAIN/api/ipn`, nothing to enter by hand.

## Project structure

```
app/                Next.js App Router (pages + API routes)
  api/ipn/          Digistore24 IPN webhook (signature check + state machine)
  optin/            public GDPR opt-in page
  plans/            public plan page (renders the product registry)
  dashboard/admin/  admin area including user management (users/)
config/             product registry (digistore-products.json — plans, source of truth)
db/                 Drizzle schema + connection (incl. subscriptions + token balance)
lib/digistore/      DS24 client, IPN verification, product links, billing on demand,
                    credentials from the environment (settings.ts)
lib/tokens/         prepaid tokens: packages, balance/consumption, auto top-up
lib/users/          user management: rules (rules.ts) + database (manage.ts)
lib/roles.ts        roles without server dependencies (usable in the browser too)
drizzle/            database migrations (checked in, run the same everywhere)
scripts/db/         reset.mjs (rebuild the local DB) + seed.mjs (initial data)
scripts/ds24/       setup: sync products, approval, set up IPN
scripts/users/      create accounts/roles via CLI
scripts/ds24/       tunnel.mjs (Cloudflare Quick Tunnel for local IPNs)
.claude/skills/     guided skills for extending with Claude Code
run.mjs             all commands for everyday work (node run.mjs = overview)
```

Database & migrations: see [`docs/database.md`](docs/database.md).
Scheduled jobs (they run by themselves): see [`docs/cron.md`](docs/cron.md).
Environments (DEV/STAGING/PROD) & local webhooks: see [`docs/environments.md`](docs/environments.md).

## Security

- The IPN signature check (SHA512) is **mandatory** — never switch it off.
- API keys/secrets belong in `.env` or in your host's secret management,
  **never in the code**.
- Auth protection is **opt-in**: `proxy.ts` guards only the paths in its
  `matcher` (today `/dashboard/*`). A new page holding customer data is public
  until you add it there. Public by design: home, login, `/plans`, opt-in and
  the IPN endpoint.
