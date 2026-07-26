---
name: setup-hosting
description: Puts the app on a server — picks a host with the user (Railway, Render, Fly.io or DigitalOcean), says what they have to book and what it costs, installs the host's CLI, gets the agent authenticated, creates the app and the managed Postgres, sets every environment variable, wires the migration into the deploy and puts a domain on it. Use this when the user wants to deploy, go online, "put it on a server", asks which host to choose, what hosting costs, or when go-live reaches the hosting step.
---

# Setting up the hosting

The user has an app that runs on their machine and wants it on the internet.
Most of them have never deployed anything, do not have an account anywhere, and
do not know what a managed Postgres is. **You do the deploy. They make three
decisions and click twice.**

The reference behind this skill is [`docs/DEPLOY.md`](../../docs/DEPLOY.md) —
what each host costs, what each one traps you with, and the exact commands. Do
not repeat it back to the user; read it and act.

## What you do, and what genuinely stays with them

You run every command yourself, through your Bash tool. Do not hand somebody a
command to type — they are not developers, and a command in a chat message is a
command that gets pasted into the wrong window.

**Only three things need a human**, and all three because a browser asks a
person to agree to something:

1. **Creating the account** at the host (and entering a payment method).
2. **The login in the browser** — `railway login`, `flyctl auth login`. You run
   the command, the browser opens, they confirm.
3. **The DNS record** for a custom domain, at whoever sells them their domain.

Everything else — CLI install, project creation, database, environment
variables, migration hook, deploy, verification — is yours. If you catch yourself
writing "now go to the dashboard and…", stop and check whether there is a command
for it. There usually is.

## 1. Before anything: is there anything to deploy?

Three checks, and they take a minute:

```
node run.mjs test          # typecheck + tests, green
node run.mjs build         # the production build, without errors
```

A build that fails locally fails at the host too, only slower and with a worse
log. And check the mail transport (below) **now**, not after the first deploy.

## 2. Look the price up, then say it out loud

**There are no prices in this repository, on purpose** — they change, and a
number somebody budgeted on is worse when it is stale than when it is missing.
So look them up, at the moment you need them.

Before the user books anything, fetch the current pricing page of the hosts in
play and give **one rough monthly figure** for what this app actually needs:
**one small always-on instance plus one small Postgres.** Both halves — the
database is regularly the larger one, and on Fly.io it is several times the app.
One sentence is enough:

> "Running this will cost you roughly X a month at <host> — about this much for
> the app and this much for the database. There is no free option I would put a
> real product on; I can explain why if you want."

Two things you may say without looking, because they are about shape and not
about numbers:

- **The four hosts are not in the same bracket.** Fly.io's managed Postgres is
  the outlier. Never quote a figure from one host and then set the user up on
  another.
- **A free tier is not a saving here.** A free app server falls asleep — with it
  the scheduled jobs that delete buyer data — and a free database expires. Both
  surface weeks later and look like a bug in their app; one of them deletes
  their customers.

**Never present a free tier as the starting point**, and never let the cost
arrive as a surprise on a credit card statement. It is their money and their
decision, so if they want the free tier after hearing the risk, do it and say
once what to watch for.

## 3. Pick a host — one question, not four

Ask **one** question, with a recommendation in it:

> "Do you already have an account at one of these — Railway, Render, Fly.io,
> DigitalOcean? If not, I would take **Railway**: it is the shortest path from
> here to a running app."

| If they say | Take | Because |
|---|---|---|
| nothing / no idea | **Railway** | fewest steps, database included, and the cheap database of the four |
| "you do all of it" | **Fly.io** | every step is a command; the least clicking — but price its database first and say the number, and offer the app-on-Fly-database-elsewhere variant |
| "I already have DigitalOcean" | **DigitalOcean** | an account they already pay for beats a new one |
| "I already have Render" | **Render** | fine — warn about Free, both the service and the database |

Do not run a comparison. They asked for a running app, not a market survey.

## 4. Install the CLI — read the commands, do not know them

```
node run.mjs doctor --deploy --json
```

That names, per host, whether the CLI is installed, whether it is logged in, and
**the install command for the system you are on** (`fix.command` / `fix.url`).
Take it from there — the same rule as `setup-machine`: install commands live in
`scripts/dev/doctor.mjs` and nowhere else, because a copy in a skill is a copy
that is wrong on the two systems nobody here runs.

- `fix.command` without `admin` → run it yourself.
- `fix.admin` (a `sudo`) → you cannot answer a password prompt. Give them the
  one line, say what it does, wait.
- `fix.url` → hand over the link, say what to download.

Render has no CLI. That is not something you failed to find.

## 5. Authenticate — and be careful where the token lands

```
railway login          # browser; then: railway whoami
flyctl auth login      # browser; then: flyctl auth whoami
doctl auth init        # asks for a Personal Access Token
```

Tell the user **before** you run one that a browser is about to open and what
they are agreeing to. Then re-run `node run.mjs doctor --deploy` and show that
it says *logged in* — an assumed login is the thing that fails four steps later,
by which time it looks like a different problem.

**DigitalOcean is the one where a human has to produce a token** (API → Tokens →
Generate New Token, scope *write*). Three rules about it, and they hold for
`RAILWAY_TOKEN` and `FLY_API_TOKEN` just as much:

- **Never into `.env`, never into the repo, never into an app spec you commit.**
  `.env` is for this app's secrets; a hosting token is the whole account.
- **Into the shell for as long as the deploy takes**, and no longer.
- If one has been somewhere it should not be — a chat, a screenshot, a commit —
  say so plainly and revoke it at the host. A revoked token costs two minutes; a
  leaked one costs the account.

Never ask a user to paste a token into the conversation when a browser login
would do the same job.

## 6. Mail first — it is what breaks the first deploy

**In production this app does not start without a mail transport.**
`lib/env-guard.ts` checks it at startup and aborts, on purpose: the development
login does not exist outside DEV, so without mail nobody could ever sign in —
including the operator.

So before the deploy: `node run.mjs mail-setup` (Postmark or SMTP,
`docs/auth-setup.md` for the detail), and the resulting values go to the host
with everything else. If the user has no sender domain yet, that is a thing to
solve now, not after the app is online and refusing to boot.

## 7. Deploy

Follow the host's section in [`docs/DEPLOY.md`](../../docs/DEPLOY.md). Whatever
the host, five things have to be true when you are finished, and it is worth
checking them as five separate questions:

1. **The app builds and runs** — `npm ci && npm run build`, then `npm run start`.
2. **A managed Postgres is attached** and `DATABASE_URL` comes from the host's
   own binding, not from a string you pasted. A pasted one is a string that
   goes stale the day the database is rotated.
3. **Every required environment variable is set** — the table in `docs/DEPLOY.md`.
   Go through it as a list; missing one produces an app that starts and then
   fails at the one thing the user tests first.
4. **The migration runs before the new version takes traffic** — the pre-deploy
   command / `release_command` / `PRE_DEPLOY` job, running `npm run db:migrate`.
   Not "I will run it by hand after each deploy": that is the step that gets
   skipped, and it is skipped on the deploy that needed it.
5. **`APP_URL` is the address the app is actually reachable at**, https, no
   trailing slash.

## 8. The operator account — before anyone else signs in

A fresh production database is empty, and the "first account becomes owner" rule
is DEV-only on purpose. So the first person to sign in on a live app is whoever
gets there first, and that may be a customer.

Create it yourself, against the production `DATABASE_URL`:

```
node run.mjs user-create --email <the user's address> --role owner --apply
```

Then have them sign in once — through the real mail, which also proves the mail
transport works.

## 9. Prove it

```
https://YOUR-DOMAIN/api/healthz     → {"status":"ok"}
https://YOUR-DOMAIN/api/readyz      → ready      (this one asks the database)
node run.mjs smoke --url https://YOUR-DOMAIN
```

No 5xx. Production runs into errors that never appeared locally — a missing
variable, a migration that did not run — and this is where they surface.

Then read the host's log once with your own eyes (`railway logs`, `fly logs`, the
dashboard). `✓ Environment: PRODUCTION` in it means the environment check passed;
its absence means the app is not the one answering.

## 10. Hand back

The app is online. What makes it *sell* is the next thing, and it belongs to
**`go-live`**: `node run.mjs ds24-sync` against the live `APP_URL` so the IPN
points at the real domain, product approval, and a test purchase played through
end to end. Say that in one sentence and start it.

## The rules

1. **Say the price before they book.** Once, in a sentence, without drama.
2. **Never a free tier without naming what it costs them** — a sleeping app and
   an expiring database, both discovered late.
3. **Install commands come from `doctor --deploy --json`**, never from memory.
4. **A hosting token never touches the repo, `.env`, or the chat.**
5. **The migration belongs in the deploy**, not in your good intentions.
6. **Verify before you report.** healthz, readyz, smoke, and a look at the log.
   "It deployed" is not the same sentence as "it works".
7. **Secrets go to the host, and stay there.** They are not in the commit that
   sets everything else up.
