<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Scheduled jobs — things the app does without being asked

Some work has no request behind it. Deleting data that has aged out, sending a
reminder, reconciling something overnight. This is where that lives.

```ts
// lib/cron/jobs.ts — add an entry, and it is scheduled.
{
  id: "remind-expiring-plans",
  describe: "Mail members whose access ends in three days.",
  async run({ now, settings }) {
    const sent = await remindExpiring(now);
    return `${sent} reminder(s) sent`;   // one line of numbers, stored and shown
  },
}
```

```json
// config/cron.json — and when it runs.
"remind-expiring-plans": { "enabled": true, "everyMinutes": 1440 }
```

That is the whole mechanism. Everything below is the reasoning and the traps.

---

## The short version

| | |
|---|---|
| The jobs | `lib/cron/jobs.ts` → `CRON_JOBS` |
| When they run | `config/cron.json` |
| Who runs them | the app itself, while it is up (`lib/cron/scheduler.ts`) |
| What ran, and when | `node run.mjs cron --list` |
| Run one now | `node run.mjs cron --job <id>` |
| The other way in | `POST /api/cron` with `Authorization: Bearer $CRON_SECRET` |
| Where the record lives | the `cron_runs` table, one row per job |

---

## How it runs

**The app schedules itself.** `instrumentation.ts` starts a timer at server
start; once a minute it asks the database which jobs are due and runs them.
Nothing has to be configured, on any host, and a fresh install cleans up after
itself from the first day.

That is a deliberate change from how this template used to work. There was a
cron *endpoint* and a line in `docs/DEPLOY.md` telling the Operator to point
their host's scheduler at it — a step at the end of a deploy, different on every
platform, for a job whose failure is completely invisible. Nothing breaks when
nobody schedules it. The table just grows and the data just stays, and the first
sign of trouble is a GDPR question you cannot answer.

**The endpoint is still there**, for the Operator who would rather their
platform decide the hour:

```json
// config/cron.json
{ "enabled": false }
```

```
POST https://YOUR-DOMAIN/api/cron
Authorization: Bearer <CRON_SECRET>
```

Same registry, same locking, same records. There is no second list of jobs
anywhere.

**`node run.mjs cron` calls that endpoint on your local app.** It does not
reimplement the jobs, deliberately: two implementations agree until the day they
do not, and a job you triggered by hand would prove nothing about the path
production takes. So a manual run exercises the real authentication, the real
lock and the real bookkeeping.

---

## The schedule is an interval, not a cron expression

`everyMinutes`, and that is all:

```json
"prune-ai-usage": { "enabled": true, "everyMinutes": 1440, "retentionMonths": 12 }
```

| | |
|---|---|
| `enabled` | `false` switches this job off. Everything else stays. |
| | ⚠️ **`--job <id>` runs it anyway.** Naming a job by hand is an instruction, not a schedule, so `"enabled": false` does not protect a job from `node run.mjs cron --job prune-ai-usage`. If you switched a deletion off because you want the data, do not then force it. |
| `everyMinutes` | 1440 = daily, 60 = hourly, 10080 = weekly. Minimum 1. |
| anything else | passed to the job as `settings`. The scheduler never reads it. |

**There is no cron parser here, and that is a decision.** A parser is either a
dependency or a bug, and "at 03:15 on Tuesdays" is not something any job in this
app needs. A job is due when it last **finished** longer ago than its interval —
measured from the finish, so a job slower than its own interval never queues up
behind itself.

If you genuinely need a wall-clock hour, you already have the tool: switch the
in-app scheduler off and let your host's cron call `/api/cron`. That is a thing
crontab is good at and this file is not.

**A job that has never run is due immediately.** A fresh deploy does its first
cleanup rather than waiting a day, and a job whose row was deleted recovers on
its own.

---

## Two instances, one job

Every app process holds its own timer. Two containers behind a load balancer
both wake up, both look at the same database, and both would run the same
deletion — so the claim and the due-check are **one conditional UPDATE**:

```sql
UPDATE cron_runs SET locked_at = now()
WHERE job = $1
  AND (locked_at IS NULL OR locked_at < $stale)
  AND (last_finished_at IS NULL OR last_finished_at < $due)
RETURNING job
```

Whoever gets a row back runs it. The other gets nothing and moves on, silently.
Read-then-write would leave a gap that both pass through — the same reason
`claimReloadSlot()` works the way it does where a card is about to be charged.

**A lock older than an hour is treated as abandoned.** A process that dies
mid-job leaves the lock set and nothing else would ever clear it; without the
stale window, one crash stops a daily job for ever. The cost of getting it wrong
is a job running twice, which is why:

---

## The four rules for a job

1. **It must be safe to run twice.** The scheduler tries hard, and a redeploy at
   the wrong moment, a stale lock, or an Operator pressing the button will still
   get you a second run. Deleting rows older than a cutoff is idempotent.
   Sending a mail is not, unless the job records that it sent one.
2. **It returns one line of numbers.** That line is stored in `cron_runs` and is
   what somebody reads to find out whether the job is working. **No address, no
   member id, no text anybody typed** — `cron_runs` has to stay a table with no
   privacy question attached (`docs/data-protection.md` §11).
3. **It throws on failure.** The runner records `failed`, counts it, and the
   next tick tries again. Swallowing an error makes a broken job look like a
   healthy one, which is the exact failure this whole mechanism exists to make
   visible.
4. **It finishes in well under an hour.** That is the stale-lock window. A job
   still running when its lock goes stale can be started a second time beside
   itself.

Two more, less about correctness and more about not being surprised:

- **`now` comes from the context, never `new Date()` inside the job.** One tick,
  one clock. It is also what makes a job testable.
- **A job runs inside the app**, so it has `db`, `lib/email.ts`, `hasPlan()` and
  everything else. That is why the registry is TypeScript and not a shell
  command: the second job anybody writes needs one of those.

---

## What ships

Five jobs. Four are housekeeping — they delete or close rows that have aged
out. The fifth deletes nothing and fixes nothing; it exists to make one state
visible that is invisible everywhere else, and it is the one worth reading if
you are about to write a job of your own.

| | | |
|---|---|---|
| `prune-ai-usage` | daily | deletes model-call rows past the retention window |
| `prune-ipn-log` | daily | deletes raw webhook payloads past 60 days |
| `close-impersonations` | 5 min | closes support sessions whose 30 minutes ran out and that nobody ended |
| `prune-impersonations` | daily | deletes impersonation records past the retention window |
| `check-stuck-reloads` | hourly | **reports only** — auto top-ups that billed a card and never got a credit back |

### `prune-ai-usage` — 12 months

```json
"prune-ai-usage": { "enabled": true, "everyMinutes": 1440, "retentionMonths": 12 }
```

`ai_usage` is the first table in this app that grows with **use** rather than
with customers: one row per model call, for ever. Twelve months keeps
"what did AI cost me last November" answerable and a year-on-year comparison
possible.

⚠️ **This deletes cost history.** The AI-costs page can only report what is in
the table, so a pruned period reads as **zero**, not as unknown. If the numbers
matter to your accounting, export before you shorten the window.

The retention is **calendar months**, not `30 × n` days: somebody who writes 12
means the same date last year, and 360 days is five days short of that, every
year, with nothing to say so.

### `prune-ipn-log` — 60 days

The IPN log keeps the full raw payload of every incoming webhook, which is buyer
PII. Sixty days is long enough to diagnose a failed webhook and short enough to
defend as data minimisation. This one used to be a hand-wired endpoint; it is
now an entry in the registry like everything else.

### `close-impersonations` — every 5 minutes

Closes the record of a support session whose thirty minutes ran out and that
nobody ended. Stepping out, signing out and noticing the expiry on a live
request all have a moment to write the end — **closing the tab does not**, and
nothing ever comes back to that session. Without this job those rows stay open
for ever and the record becomes unreadable within a week: a finished session and
a running one look identical. Idempotent by construction — the `UPDATE` excludes
rows that already carry an end.

### `prune-impersonations` — 12 months

⚠️ **This deletes the answer to "did somebody go into my account last spring".**
The window matches what this template already keeps `ai_usage` for; a shorter
one weakens a member's own subject access request, and that is the trade being
made rather than a default nobody thought about.

### `check-stuck-reloads` — hourly, and it changes nothing

The odd one out, and the reason it is here rather than on the request path.

Auto top-up bills a card and waits for the IPN to book the credit. When that IPN
never arrives, the balance is never raised, the threshold is still undershot,
and six hours later the stale-lock timeout hands the slot back — so the card is
billed again. `reloadIsPaused()` stops that at the second unconfirmed charge
(see [`digistore-billing-modes.md`](digistore-billing-modes.md) → *Auto-reload*),
which closes the loop but says nothing to anybody.

**Nothing about that state looks like a fault.** Every charge succeeded, no
exception was thrown, and the Member's own switch still reads "on".

And it cannot be left to the spend path to notice, which is the part worth
copying into your own job: a Member stuck at a zero balance **stops using the
app**, so `spendTokens()` — the only thing that ever calls
`autoReloadIfNeeded()` — is never called again. The account that most needs
reporting is the one nobody touches. A state that only a request can discover is
a state nobody discovers.

It reports a bare count, per rule 3 above: who it happened to belongs on
`/dashboard/admin/users/<id>`, which is behind `requireOwner()`, and in
`node run.mjs logs`. `cron_runs` has no privacy question attached and stays that
way.

---

## Changing a retention window

One number, one file, effective on the next run:

```json
"prune-ai-usage": { "retentionMonths": 24 }
```

Two things the code will not let you do by accident, both of which delete
everything:

- **`"retentionMonths": null`** — `Number(null)` is `0`, and so is `Number("")`
  and `Number(false)`. Every one of them reads as a perfectly valid zero-month
  retention. `configuredNumber()` in `lib/cron/rules.mjs` refuses all of them and
  the job falls back to its default. A deliberate `0` has to be written as a
  number.
- **A typo'd job name.** `config/cron.json` naming a job that is not in the
  registry is reported by name — `node run.mjs cron --list` shows it, and
  `lib/cron/rules.test.ts` fails the build if the *shipped* file has one. A job
  nobody looks up is a job that silently never runs, and a rename is how that
  happens.

---

## Is it actually running?

The question this whole thing is built to answer, because a cleanup that quietly
stopped looks exactly like a cleanup with nothing to do.

```bash
node run.mjs cron --list
```

```
prune-ai-usage  —  daily
  Delete AI-usage rows older than the retention window (default 12 months).
  last run: 3 h ago (ok) — 412 row(s) older than 12 month(s) deleted

check-stuck-reloads  —  hourly
  Count accounts whose auto top-up stopped charging because no credit came back.
  last run: 12 min ago (ok) — 1 account(s) stopped charging — top-up billed, no credit booked
```

`last run: never` on a week-old installation, or a `⚠ n of m run(s) failed`,
is the signal.

⚠️ **`(ok)` is about the job, not about what it found.** The second line above
is a healthy run reporting an unhealthy app: somebody's card was billed and no
credit ever arrived. A reporting job is green whenever it managed to count, so
read the count, not the status. In production the same thing is `GET /api/cron?list` with the
bearer token, and every run also writes a `[cron]` line to
`node run.mjs logs`.

---

## `CRON_SECRET`

The endpoint protects itself with a bearer token, because `proxy.ts` matches
`/dashboard` only and everything under `app/api/` is public until it does — the
same rule `/api/ipn` and `/api/mcp` live by.

**Without `CRON_SECRET` set, the endpoint refuses to run at all** (503, so an
Operator can tell "never configured" from "wrong token"). It can never be left
open as a "delete my data" URL by somebody who has not reached that step.

Locally `node run.mjs cron` generates one into `.env` on first use, exactly as
`AUTH_SECRET` is generated. In STAGING and PROD it belongs in the host's secret
management — `docs/DEPLOY.md`.

**The in-app scheduler needs no secret.** It is not making a request.

---

## When the app is not running

Two jobs have offline twins that go straight at the database:

```bash
node run.mjs db-prune-ai --dry-run    # count first — it also prices what would go
node run.mjs db-prune-ai --days 90
node run.mjs db-prune-ipn --days 30
```

They exist for the case where you want rows gone and the app is down, and for
the `--dry-run` the scheduled path has no equivalent of. They are the only
duplication in here, and they are duplicated on purpose: a cleanup you can only
run by starting the app is a cleanup you cannot run when the app is the problem.

---

## Files

| File | What it is |
|---|---|
| `lib/cron/jobs.ts` | **The registry.** Adding a job is adding an entry. |
| `lib/cron/rules.mjs` | Pure: due, stale, retention windows, config faults. |
| `lib/cron/config.ts` | `config/cron.json`, read in one place. |
| `lib/cron/run.ts` | The claim, the run, the bookkeeping. |
| `lib/cron/scheduler.ts` | The timer. Started from `instrumentation.ts`. |
| `app/api/cron/route.ts` | The way in from outside. |
| `scripts/cron/run.mjs` | `node run.mjs cron`. Calls the endpoint. |
| `db/schema-cron.ts` | `cron_runs`. |
