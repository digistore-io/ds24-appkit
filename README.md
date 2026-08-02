<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Digistore SAAS App Template

A starter template for **SAAS applications that bill through Digistore24** —
built so that you can extend it **together with an AI coding agent**, even without
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
  `node run.mjs ds24-connect`, thank-you page that attaches the purchase
- 🗄️ **Database** with an order state machine (paid/refunded/chargeback/…)
- 🩺 Health checks (`/api/healthz`, `/api/readyz`) for easy deployment

## Your path to a finished SaaS

Start your AI program in the project and simply say what you want — the matching
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
| 2f | **Your customer's first session** *(optional)* | `user-onboarding` | pin the activation event and replace the blueprint checklist with steps that mean your app — so the person who just paid knows what to do first |
| 3 | **The experience** | `ux-gateway` | the app as your customer meets it: the first five minutes after a purchase, dead ends, actions that report nothing back, wording, keyboard and phone — measured with `node run.mjs ux-check` where it can be, looked at where it cannot |
| 4 | **Security** | `security-gateway` | nine checks — access control, money, secrets, packages, endpoints, hosting — findings by severity, the serious ones fixed, report in `docs/reports/` |
| 5 | **Scaling** | `performance-gateway` | measure instead of guess: response times, database and indexes, ~100 concurrent users, memory, CPU, front end — fixed and measured again |
| 6 | **Legal** | `compliance-check` | which EU rules reach your app: imprint, privacy policy, terms — plus the **AI Act**, consent, your customers' rights and the records you have to be able to show |
| 6b | **The server** | `setup-hosting` | pick a host (Railway/Render/Fly.io/DigitalOcean), say what it costs, install its CLI, authenticate, app + managed Postgres, secrets, migration in the deploy, domain |
| 7 | **Live** | `go-live` | put the app online and verify it live — a real test purchase included |
| 8 | **Marketing** | `go-to-market` | positioning, channels, launch plan + ready-made content (landing page, emails, **video scripts**) |

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

**You don't have to remember any of this.** Start your AI program in the project
folder and say:

> **"Build my app"**

That is the only door. Claude then asks you whether you already have an idea —
and if not, the two of you find one together (step 0). Everything else follows
step by step.

## What you need installed

The template runs on **Linux, macOS and Windows** — all four programs do, so this
does too. **Two things you install yourself**, and to get this far you already
have both:

| | What for |
|---|---|
| **an AI coding program** | the one you build the app with. This template ships wired for four: [Claude Code](https://claude.com/claude-code), [OpenAI Codex CLI](https://developers.openai.com/codex), [Gemini CLI](https://geminicli.com) and [OpenCode](https://opencode.ai). Take whichever you already use — if you have none, Claude Code is the one the walkthroughs are written against |
| **git** | to fetch this repo — [git-scm.com](https://git-scm.com/downloads); on macOS `xcode-select --install` brings it, on Windows it brings Git Bash |

**Everything else, the agent installs for you.** That includes **Node.js ≥ 20**,
which the app itself runs on — you do not have to sort that out in advance. Say
"get my machine ready" in the project folder and the skill `setup-machine` takes
it from there: it checks what is there, names what is missing, asks before every
install, and does itself whatever does not need your password.

The list it works through is short. Genuinely required are **Node.js and git**.
**Docker** and **cloudflared** are not prerequisites — Docker is used for the
database *if you have it* (see below), and `cloudflared` only if you want to
receive real Digistore24 purchases on your own machine while developing.

**No `make` is needed** — the commands run through `node run.mjs`, which works
in every shell. On **Windows** use **Git Bash** or **WSL2** (not PowerShell);
Git for Windows brings Git Bash with it, and these programs need it there anyway.

**No Homebrew is needed on macOS either.** Where you have it, it gets used;
where you do not, nothing here asks you to install it first.

Want to look for yourself?

```bash
node run.mjs doctor
```

It says what is missing and how to install it on your system — that one command
is where the per-system install commands live, so nothing in this file can go
stale against it.

**No Docker? Then there is nothing to do.** On the first start the app looks at
your machine: if Docker is there and running, the database runs in a container —
if not, Postgres comes from an npm package instead (about 60 MB, downloaded
once). It is the same PostgreSQL 16, and every command behaves identically. The
choice is written into your `.env` as `DB_DRIVER` and then stays put, so your
database does not move around underneath you when Docker Desktop happens not to
start one morning. `node run.mjs doctor` tells you which of the two is in use.

## Quick start

Start your AI program **in this folder** — `claude`, `codex`, `gemini` or
`opencode`. Point it at the folder above this one and it finds neither the
guidance nor the skills, and "Build my app" goes nowhere.

It greets you and tells you how things continue. It takes care of setup,
database and starting the app together with you — you don't need to know any of
the commands below by heart.

If no greeting appears, run `node run.mjs greet` — the greeting says whether
this machine is ready, and silence is not the same as "fine".

*Arrived here with nothing installed yet?* [`docs/start.md`](docs/start.md) is
the walkthrough from zero — which program to install, how to get this repo, and
where to start once you have it. `https://ds24-appkit.com/start.md` redirects to
that same file, which is how somebody reaches it before they have a clone.

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
| `node run.mjs ux-check` | the interface, measured: contrast in both modes, the design system, missing names, pages in no menu — see [`docs/ux.md`](docs/ux.md) |
| `node run.mjs update` | fetch improved guidance for the AI agent (`CLAUDE.md`, `docs/`, skills) — your code is never touched, see [`docs/updates.md`](docs/updates.md) |
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

**You do not have to do this by hand.** Ask your agent for the skill
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
  optin/            public thank-you page after a purchase
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
.claude/skills/     guided skills for extending the app (all four programs)
run.mjs             all commands for everyday work (node run.mjs = overview)
```

Database & migrations: see [`docs/database.md`](docs/database.md).
Scheduled jobs (they run by themselves): see [`docs/cron.md`](docs/cron.md).
Environments (DEV/STAGING/PROD) & local webhooks: see [`docs/environments.md`](docs/environments.md).
The Digistore24 integration — API key, IPN, checkout, and the difference between
"I am the only vendor" (the default) and "my users sell through their own
accounts": see [`docs/digistore-integration.md`](docs/digistore-integration.md).

## Security

- The IPN signature check (SHA512) is **mandatory** — never switch it off.
- API keys/secrets belong in `.env` or in your host's secret management,
  **never in the code**.
- Auth protection is **opt-in**: `proxy.ts` guards only the paths in its
  `matcher` (today `/dashboard/*`). A new page holding customer data is public
  until you add it there. Public by design: home, login, `/plans`, opt-in and
  the IPN endpoint.

## License

Code **and** skills in this template are under the **MIT license** —
[`LICENSE`](LICENSE) is the binding text; what follows is only the short version.

- **Use it freely.** Copy it, change it, build your own product on it and sell
  that product — commercially too. No fee, no royalty, nobody to ask.
- **One condition:** the copyright notice and the license text stay with the
  parts of the code you take over. What you build on top of them is yours.
- **No warranty, no liability.** The software is provided **"as is"**. The
  provider gives no warranty of any kind and is **not liable** for any damage
  arising from its use — the app you build, operate and sell is yours to test,
  secure and answer for.

That last point is why steps 4 and 6 above are part of the path:
`security-gateway` before real money flows, and `compliance-check` before real
customers do.
