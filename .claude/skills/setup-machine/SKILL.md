---
name: setup-machine
description: Gets this machine ready to develop the app — checks what is missing (Node, git, optionally Docker and cloudflared), installs it after asking, and prepares the project (.env, dependencies, database, migrations). Works the same on Linux, macOS and Windows. Use this on the first run in a fresh clone, whenever the session start reports `setup=blocked`, and whenever a command fails with something like "docker: not found", "npm not found", "the database does not answer" or "cannot connect".
---

# Getting this machine ready

The app runs on Linux, macOS and Windows. What has to be installed is short —
**Node.js and git**, plus optionally Docker and cloudflared — and **you** put it
there together with the user, rather than handing them a list. Docker is not on
the required list: where it is missing, the database runs without it (step 4).

**Do not do this before every task.** If the check comes back clean, say so in
one sentence and carry on with what the user actually asked for. A setup
walkthrough for somebody whose machine is already fine is pure noise.

## Where the commands come from — the one rule

Everything you need to know about this machine, you get from:

```bash
node run.mjs doctor --json
```

That is the **only** source of install commands. Never type one out of your own
knowledge, never adapt one from another project, never pipe a script off the
internet into a shell. `scripts/dev/doctor.mjs` holds the table for all three
systems; this file deliberately holds none, so there is nothing here that can go
out of date. If a fix is missing from the JSON, that is a bug in `doctor.mjs` —
fix it there, do not work around it here.

The JSON gives you, per check:

| Field | What you do with it |
|---|---|
| `ok` | `false` = something to handle |
| `severity` | `blocker` = must be solved · `optional` = offer it · `info` = mention at most |
| `detail` | why it is not ok — say this to the user |
| `fix.command` | the exact command for **this** machine |
| `fix.url` | a page to install from, when there is no command |
| `fix.admin` | needs sudo/Administrator → **the user runs it, not you** |
| `fix.gui` | an installer with a window → **the user clicks, not you** |
| `fix.restart` | the machine has to be restarted afterwards |
| `fix.note` | an extra step that goes with it — pass it on, it is there for a reason |

## The walkthrough

### 1. Look

Run `node run.mjs doctor --json` and read it. `"ok": true` at the top level means
nothing is blocking.

### 2. Nothing missing?

Say it in one sentence, run `node run.mjs setup`, and hand over to **`build-app`**
(or carry on with whatever the user came for). Stop here.

### 3. Something missing — one at a time

Work through the `blocker` checks in the order they arrive. For each one, tell
the user in one sentence *what* is missing and *why it matters*, then act by the
flags:

- **Neither `admin` nor `gui`** → ask "shall I install it?", and on a yes run
  `fix.command` yourself with your Bash tool.
- **`admin: true`** → you cannot answer a password prompt. Give the user the
  command and ask them to run it — in Claude Code they can type `!` followed by
  the command and the output lands right here in the conversation.
- **`gui: true`** (Docker Desktop, Xcode Command Line Tools) → a person has to
  click through it. Give them `fix.command` or `fix.url`, say what the installer
  will ask, and wait.
- **`restart: true`** → say up front that the machine needs a restart, so nobody
  is surprised mid-way. After the restart the session starts over — that is
  normal, and this skill picks up where it left off.
- **A `note`** always gets passed on. `sudo usermod -aG docker $USER` followed by
  a re-login is not an optional detail: without it every docker command fails
  with a permission error that looks like a broken installation.

**After every step, run `doctor --json` again.** Never assume an install worked
because the command exited 0 — Docker Desktop in particular installs fine and
then is not running.

### 4. Docker is not a blocker — and there is nothing to decide

Docker used to be the biggest hurdle here, on Windows by a distance: Docker
Desktop, WSL2, a restart. It is not one any more, and **you do not offer a
choice about it.** On the first start the project looks at the machine
(`scripts/db/driver.mjs`): a Docker that answers is used, and where there is
none, Postgres comes from an npm package instead — the real PostgreSQL 16, so
`DATABASE_URL`, the migrations and every command behave identically. The answer
is written into `.env` as `DB_DRIVER`, once, and stays put.

So `docker` arrives as `severity: "optional"`, and you treat it like every other
optional check: mention it at most, never install it unasked, and never make the
user wait for it. What you say when it is missing is one sentence, and it is
good news:

> "There is no Docker on this machine — the app brings its own Postgres, so
> there is nothing to install. Your local setup then deviates slightly from what
> runs on the server later, and that is the only difference."

Install Docker only when the user asks for it themselves. Two things not to do:
do not talk somebody with a working Docker into the other way round (there is
nothing to gain and a difference to production to lose), and **never change
`DB_DRIVER` on a project that already has data** — the other database starts
empty, and to the user that reads as "the app forgot everything".

### 5. Prepare the project

```bash
node run.mjs setup
```

That is `.env` (including a generated `AUTH_SECRET`), the dependencies, the
database and the pending migrations, in one go.

### 6. Prove it

```bash
node run.mjs start
node run.mjs smoke
```

A green check is not proof — a loaded page is. `smoke` calls every page and
reports server errors; see `CLAUDE.md` → *Never ship a broken page*. Only after
this do you say the machine is ready.

If `smoke` reports a 5xx, look at `node run.mjs logs` for the real stack trace.
A `307` to `/login` is correct, not an error: those pages are protected.

### 7. Hand over

Say in one sentence what changed, and start **`build-app`** — or carry on with
what the user originally wanted.

## What you never do

- **Never disable a check to get past it.** A skipped check is a failure moved
  to a later, more confusing moment.
- **Never edit `.env` by hand.** `setEnvValue()` in `scripts/lib/env-write.mjs`
  is the single writer; hand-editing loses comments and duplicates keys.
- **Never install anything the JSON did not name.** No global npm packages, no
  version managers, no "while we're at it". This is somebody's machine.
- **Never change `DATABASE_URL`, `DB_PORT` or `APP_URL` to make something fit.**
  Occupied ports resolve themselves (`node run.mjs start` steps to the next free
  one and writes it down). A hand-picked port that disagrees with the running
  database is the one failure mode nobody finds afterwards.
- **Never claim it works without having run `smoke`.**

## Two things that surprise people

- **Node.js can only ever be reported as "too old", never as "missing".** If
  Node were absent, `run.mjs` could not have run at all — and Claude Code needs
  it anyway. So on a machine that got this far, the realistic gaps are git,
  Docker and cloudflared.
- **On Windows the commands belong in Git Bash or WSL2**, not in PowerShell or
  cmd. The `shell` check says so when it applies. Git Bash comes with Git for
  Windows, which Claude Code needs there regardless.
