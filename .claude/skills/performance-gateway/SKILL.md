---
name: performance-gateway
description: The performance check for this app. Measures where it is slow and fixes it — response times per route, database queries and missing indexes, N+1 patterns, the connection pool, behaviour under ~100 parallel users, memory leaks, a blocked event loop, bundle size and Core Web Vitals — then writes a report. Use it after the security gateway and before the launch, and whenever somebody says "it is slow", "it times out", "will it hold under load?".
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Performance gateway — measure, fix, measure again

The goal for the first version is plain and testable: **~100 concurrent users,
no errors, page and API responses fast enough that nobody notices them.** Not
"make it fast".

The method is the whole point: **measure → find the bottleneck → fix → measure
again.** Do not guess. Almost every slow app in this shape is slow for one of
three reasons — the connection pool, a missing index, or a query inside a loop —
and all three are visible in a measurement and invisible in a code read.

Written for **this** template: Next.js 16, postgres.js + Drizzle on Postgres, a
single Node process on Railway/Render/Fly/DigitalOcean. It names the actual
files, so it can be specific where a generic guide can only be plausible.

## How to use this skill

Eight checks. You do not have to know which one you want.

| # | Check | What it measures | Roughly |
|---|---|---|---|
| 1 | **`all`** | everything below, in the right order | 30–50 min |
| 2 | **`response`** | how long each route takes, one user at a time | 5 min |
| 3 | **`db`** | queries, indexes, N+1, the connection pool | 10–15 min |
| 4 | **`load`** | ~100 parallel users: errors, latency, throughput | 10 min |
| 5 | **`memory`** | server heap and browser heap — does it grow and never fall | 10 min |
| 6 | **`cpu`** | hot functions, a blocked event loop | 10 min |
| 7 | **`frontend`** | Lighthouse, Core Web Vitals, bundle size | 5–10 min |
| 8 | **`fix`** | fix the findings of the last report | depends |

**How to dispatch:**

- If the user already said what they want ("the dashboard is slow", "run a load
  test"), start that check. Do not show the menu first.
- Otherwise show the table, say that **`all`** is the one to run before a launch,
  and wait. A number, a name or a description all count.
- When somebody just says "it is slow": **`response`** first. It takes five
  minutes and it tells you which of the other checks to run.
- **You run the commands** — through your Bash tool, not by telling the user to
  type them. That is the rule for the whole template.

Every check ends the same way: findings with a severity → into the report →
offer to fix.

## Measure against a production build. Always.

`node run.mjs start` runs `next dev`, which compiles on demand, ships no
minified bundle and is several times slower than the real thing. Numbers taken
against it are not wrong by a little — they are meaningless, and they send you
optimising code that is already fast.

Before any measurement:

```bash
node run.mjs stop
npm run build
npx next start -p 3100        # or the deployed URL, which is better still
```

Load-test against port 3100, not 3000, so a `next dev` left running somewhere
cannot quietly answer instead. Where the app is already deployed, measure the
deployed instance: it has the real database latency, the real instance size and
the real network in it. Note in the report which one you measured — the numbers
mean different things.

The load generator and the app share a machine locally. That costs perhaps 20 %
and does not change any conclusion, but say it in the report rather than
pretending the number is clean.

## What counts as a finding

**Severity — measured, not felt:**

| | Severity | Meaning |
|---|---|---|
| 🚨 | **CRITICAL** | The app falls over or is unusable. Fix before anything else. |
| ❌ | **HIGH** | Everyone notices. Fix before the launch. |
| ⚠️ | **MEDIUM** | Measurable, tolerable today, worse with more data or more users. |
| ℹ️ | **LOW** | Worth doing when convenient. |

The thresholds per check are in each section. They are the boundary, not a
target: an endpoint at 190 ms is not "fine", it is "not a finding".

**The format of a finding — the same as in `security-gateway`:**

```
❌ HIGH — /dashboard/billing loads the order list per row
   Where:    app/dashboard/billing/page.tsx:48
   Why:      One query per order. At 40 orders that is 41 round trips, and it
             gets worse for every customer who buys again.
   Fix:      One query with a join — Drizzle `with: { invoices: true }`.
   Evidence: p95 1.9 s, 41 queries in the log for one page view.
```

**Every performance finding carries a number.** "Feels slow" is not a finding;
"p95 1.9 s against a 300 ms threshold" is. If you cannot measure it, it goes in
**Worth a look** at the end of the report, not in the count.

## 1 · `all` — the full pass

In this order. It is not arbitrary: each step tells you what to expect from the
next, and the database is the answer far more often than anything else.

1. **`response`** — the map. Which routes are slow at all.
2. **`db`** — the cause, in most cases.
3. **`load`** — does it survive 100 people. Run it after the database is fixed,
   or you spend the run measuring the same bottleneck a hundred times.
4. **`memory`** — leaks only show under sustained load, so straight after.
5. **`cpu`** — only if `response` or `load` pointed at it. Usually skippable.
6. **`frontend`** — independent of all of the above; run it whenever.

Then: one report, one summary, one offer to fix.

## 2 · `response` — how long each route takes

One user, no contention. This is the baseline everything else is measured
against.

```bash
npx autocannon -c 1 -d 5 http://localhost:3100/
npx autocannon -c 1 -d 5 http://localhost:3100/plans
npx autocannon -c 1 -d 5 http://localhost:3100/api/healthz
```

Signed-in pages need a session cookie. Sign in with a real account, take the
`authjs.session-token` cookie from the browser, and pass it:

```bash
npx autocannon -c 1 -d 5 -H "cookie: authjs.session-token=<value>" \
  http://localhost:3100/dashboard
```

Measure the routes that matter: the home page, `/plans`, `/dashboard`,
`/dashboard/billing`, whatever the user built themselves, and `/api/healthz` as
the floor — it does almost nothing, so it tells you what the framework costs
before your code does anything at all.

| Metric | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| p95, API route | > 200 ms | > 500 ms | > 1 s | > 3 s |
| p95, page | > 500 ms | > 1 s | > 2.5 s | > 5 s |
| p95 minus p50 | > 200 ms | > 500 ms | > 1 s | > 3 s |

The third row is the one people forget. A route whose p50 is 80 ms and whose p95
is 1.4 s is not a fast route with noise — something intermittent is happening,
usually a cache miss or a connection wait, and it will get worse under load.

For anything over threshold, find out where the time goes before optimising:
a slow database query (→ `db`), a call to an external API (an AI provider,
Digistore24 — cache it or make it not block the render), work on every render
that could be done once, or an oversized payload. Say which, with evidence.

## 3 · `db` — the usual culprit

### The connection pool

`db/index.ts` builds one pool per process, `DB_POOL_MAX`, default 10.

- **One permanently running server** (all four hosts in `docs/DEPLOY.md`):
  10–20 is right. **`DB_POOL_MAX=1` is a CRITICAL** — every request queues
  behind every other and the app is serialised.
- **Several instances or serverless:** connections multiply (instances × pool)
  and Postgres' `max_connections` is the wall. Keep the pool small and put a
  pooler in front (PgBouncer, Neon or Supabase pooling). A pool of 20 on 5
  instances against a 100-connection database is **HIGH**: it works until it
  suddenly does not.
- **One client per process.** A `postgres()` call inside a request handler or a
  module that gets re-imported per request is **CRITICAL** — connections are
  created and never returned.

Check what the database itself thinks:

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
SHOW max_connections;
```

Run SQL by writing a throwaway script into `.dev/` (it is gitignored, and the
template already uses it for exactly this) and running it with `node` — that
works on all three operating systems, `psql` does not:

```js
// .dev/q.mjs
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
console.log(await sql`SELECT count(*), state FROM pg_stat_activity GROUP BY state`);
await sql.end();
```

### Indexes

Postgres does **not** index foreign keys automatically. The template's own
tables are indexed already — `orders_member`, `grants_member`,
`grants_member_product`, `subscriptions_member`, `chat_messages_member`,
`token_ledger_account_created`, `mcp_keys_member`, the `ai_usage_*` set. So the
gap is almost always in **the tables the user added themselves**.

For every table in `db/` that is not part of the template: every column used in
a `where` or an `order by` on a page the customer sees needs an index — the
`memberId` column above all. Missing index on an owner column is **HIGH**; it
looks fine at 100 rows and dies at 100,000.

Find it rather than guessing:

```sql
SELECT relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan AND n_live_tup > 500
ORDER BY seq_scan DESC;
```

Then confirm with the actual query:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

A `Seq Scan` on a table with real rows, a `Rows Removed by Filter` in the
thousands, or a sort with no index behind it — each one is the finding, with the
plan as evidence.

After adding an index: `node run.mjs db-generate`, review the generated file in
`drizzle/`, then `node run.mjs db-migrate`. Never hand-edit a migration that has
run.

### N+1

The pattern that scales with the customer's success. Read every page and action
that renders a list and look for a query inside the loop — or, more honestly,
count the queries: set `DEBUG` logging on postgres.js, or log in the Drizzle
client, load the page once, and count.

Drizzle's answer is `with` (relations) or an explicit join. Missing it is
**MEDIUM** for a list that cannot grow and **HIGH** for one that grows per
customer — orders, invoices, ledger entries, chat messages.

| Queries for one page view | Verdict |
|---|---|
| ≤ 5 | fine |
| 6–20 | ⚠️ MEDIUM |
| 21–50 | ❌ HIGH |
| > 50 | 🚨 CRITICAL |

### The rest

- **Select what you show.** `select()` with no columns fetches every column,
  including ones no page renders. **LOW**, unless the table has a big text
  column in it — then MEDIUM.
- **Paginate lists that grow.** Orders, ledger entries, chat history, IPN
  events. A page that loads everything is **HIGH** the moment somebody uses the
  app a lot.
- **Do not regenerate what is cached.** Checkout URLs live in `buy_url_cache`
  (`lib/digistore/buyUrl.ts`) and cost an API round trip to Digistore24 when
  they miss. Building one per request is **HIGH** — it makes `/plans` as slow as
  a third party's API and as reliable.
- **Prune what only grows.** `ipn_events` and `ai_usage` are append-only.
  `node run.mjs db-prune-ipn` and `db-prune-ai` exist; on a live app they belong
  in the cron (`docs/cron.md`).

## 4 · `load` — ~100 parallel users

The proof. Against the production build, on the routes a real visitor hits.

```bash
npx autocannon -c 100 -d 20 http://localhost:3100/
npx autocannon -c 100 -d 20 http://localhost:3100/plans
npx autocannon -c 100 -d 20 http://localhost:3100/api/healthz
```

`-c 100 -d 20` is 100 open connections for 20 seconds. Compare each result with
the same route's single-user number from `response`: the gap *is* the finding.

**Do not load-test `/api/ipn`.** It writes orders and grants. If you want to
know it holds, test it with invalid signatures — the rejection path is the
expensive one anyway, and it changes nothing.

**Do not load-test `/api/chat`** against a real provider unless you mean to pay
for it. Say so rather than quietly skipping it.

| Metric at `-c 100` | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| errors / timeouts | any | > 0.1 % | > 1 % | > 5 % |
| p95 latency | > 500 ms | > 1 s | > 3 s | > 10 s |
| p99 latency | > 1 s | > 2 s | > 5 s | > 15 s |
| p95 vs. single user | 3× | 5× | 10× | 25× |

**The target for the first version: zero errors, zero timeouts, p95 in the
three-digit milliseconds on dynamic pages.** Anything else is a finding, not a
result.

When it breaks: the pool first (a p95 that is a clean multiple of the single-user
time is queueing, near enough always the pool or the database), then indexes,
then the instance size. Fix one thing, measure again. Two changes at once and
you have learned nothing.

## 5 · `memory` — does it grow and never fall

Leaks are invisible in a five-minute test and fatal in a week. Measure during or
right after the load test, when the process has actually done work.

**Server:**

```bash
node --heap-prof node_modules/next/dist/bin/next start -p 3100
# put load on it, stop it, open the .heapprofile in Chrome DevTools
```

Cheaper and usually enough: watch RSS across a load run and see whether it comes
back down after the load stops.

What actually leaks in an app this shape:

- A `setInterval` with no `clearInterval` — cron helpers, polling.
- A `Map` used as a cache with no eviction. `lib/rate-limit.ts` holds timestamps
  per key in memory by design and is bounded by its window — that is fine and
  documented. A new unbounded one is not.
- Event listeners added per request.
- A large object captured in a module-level closure.

| Server heap growth | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| after load, not released | > 10 MB | > 50 MB | > 200 MB | > 500 MB |

**Browser:** the dashboard is a long-lived client session, so it can leak too.
Open it, take a heap snapshot in DevTools, navigate between dashboard pages ten
to twenty times, snapshot again. Growth that never comes back is the finding —
detached DOM nodes and listeners that survive a route change, usually a
`useEffect` with no cleanup.

| Browser heap after 10 navigations | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| growth | > 5 MB | > 20 MB | > 50 MB | > 100 MB |

## 6 · `cpu` — hot functions and a blocked event loop

Only worth running when `response` or `load` pointed here — a route that is slow
with the CPU idle is waiting on something, not computing.

```bash
node --cpu-prof --cpu-prof-dir=.dev node_modules/next/dist/bin/next start -p 3100
# put load on it, stop it, open the .cpuprofile in Chrome DevTools
```

Node is single-threaded per process: anything synchronous blocks **every**
request, not just its own. So the findings that matter are the blocking ones.

- **Synchronous I/O in a request path** — `readFileSync`, `execSync`. The
  assistant's handbook is read from `content/knowledge/` (`lib/ai/knowledge.ts`);
  reading it per request rather than once is **HIGH**.
- **Crypto in the request path.** `scrypt` in `lib/credentials/hash.ts` is
  deliberately expensive — that is the point of a password hash, and it is
  correctly the async form. A synchronous variant is **CRITICAL** under load.
- **JSON work on large payloads** on every request — cache it or narrow it.
- **A regex that backtracks.** Also a security finding (ReDoS); mention it in
  both reports.

| | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| one function, share of CPU | > 10 % | > 25 % | > 50 % | > 75 % |
| synchronous block | > 10 ms | > 50 ms | > 200 ms | > 1 s |

## 7 · `frontend` — what the visitor actually waits for

Against the production build, or the deployed URL:

```bash
npx lighthouse http://localhost:3100/ --only-categories=performance \
  --chrome-flags="--headless" --output=json --output-path=.dev/lh-home.json
```

Needs a Chrome on the machine. If there is none, say so and measure what you can
(bundle size, `response`) rather than reporting nothing.

Measure the home page and `/plans` — those are the pages a stranger sees, and
the ones where a slow load costs a sale. The dashboard matters less; it is
behind a login and its visitors are already customers.

| Metric | ℹ️ LOW | ⚠️ MEDIUM | ❌ HIGH | 🚨 CRITICAL |
|---|---|---|---|---|
| Lighthouse performance | < 90 | < 75 | < 55 | < 35 |
| LCP | > 2.5 s | > 4 s | > 6 s | > 10 s |
| INP | > 200 ms | > 500 ms | > 800 ms | > 1 s |
| CLS | > 0.1 | > 0.25 | > 0.5 | > 1 |
| first-load JS, gzipped | > 200 kB | > 400 kB | > 800 kB | > 1.5 MB |

`npm run build` prints the first-load JS per route; read it rather than guessing.

What is usually behind it here:

- **`"use client"` where it is not needed.** Every client component and
  everything it imports ships to the browser. A page that could be a server
  component and is not is the single biggest bundle win in a Next.js app.
- **Images without `next/image`**, or without width and height — the second one
  is what CLS is made of.
- **A heavy import for a small job** — a whole date or icon library for one
  call. Check what `npm run build` attributes to each route.
- **Fonts.** `geist` is loaded through `next/font`, which handles this. A
  hand-rolled `@font-face` without `font-display: swap` is a finding.
- **Work on every render** that could be done once, or on the server.

## 8 · `fix` — fixing what was found

Same discipline as the security gateway, plus one rule of its own.

1. **Highest severity first**, and within that, the cheapest fix first. A pool
   setting is one line; a query rewrite is an afternoon.
2. **One change at a time, then measure again.** This is the rule that makes the
   whole skill work. Two changes and one improvement teaches you nothing about
   which one did it — and the other one may have made things worse.
3. **Write the before and after into the report.** "p95 1.9 s → 240 ms" is the
   only thing that proves the fix was a fix.
4. **`node run.mjs test`** afterwards. A query rewrite that changes behaviour is
   not an optimisation, it is a bug.
5. **Do not optimise what nobody waits for.** A 40 ms admin page used twice a
   week is not a finding, whatever the threshold says. Say so and move on.

## The report

Every run writes one, whether it found anything or not — so that "have we
already tested this under load?" is answerable in three months, and so the next
run has a number to compare against.

Write it to **`docs/reports/performance-YYYY-MM-DD.md`** (add `-2`, `-3` for a
second run the same day). Create the folder if it is not there.

```markdown
# Performance report — 2026-07-26

Checks:   response, db, load, frontend     (memory, cpu: skipped — no finding pointed there)
Measured: production build, localhost:3100, commit a1b2c3d
          (load generator on the same machine — expect ~20 % pessimism)

🚨 CRITICAL 0   ❌ HIGH 1   ⚠️ MEDIUM 2   ℹ️ LOW 3   ✅ accepted 1

## Numbers
| Route | p50 | p95 | p95 @ -c 100 | errors |
|---|---|---|---|---|
| /            | 40 ms | 70 ms  | 210 ms | 0 |
| /plans       | 60 ms | 120 ms | 340 ms | 0 |
| /dashboard   | 180 ms | 1.9 s | 6.2 s  | 0 |

## Findings
(four-line format, highest severity first)

## Fixed in this run
(with before → after)

## Open
## Worth a look
## Accepted baselines
```

Then say it out loud in three or four sentences: what is slow, what was fixed,
what the app now does at 100 parallel users, and whether it is ready to launch.
A straight answer — "yes", or "no, because X".

## Accepted baselines

Some slowness is a deliberate trade. Rather than rediscovering it every run, it
goes into **`docs/reports/performance-accepted.md`**:

```markdown
| Route / thing | Metric | Accepted | Why | By | Date | Review |
|---|---|---|---|---|---|---|
| /dashboard/admin/purchases | p95 1.4 s | ≤ 2 s | owner-only, twice a week | Anna | 2026-07-26 | when it has staff |
```

An accepted baseline is **not counted** in the totals and appears in its own
section of the report. Only the user accepts one. If the measured value drifts
past what was accepted, it is a normal finding again — the acceptance covers a
number, not a route.

## STOP — get a human

- The fix requires spending money (a bigger instance, a managed pooler, a CDN).
  Name the option and the cost; do not book anything.
- The fix means deleting or archiving customer data. That is a `guardrails` STOP.
- The load test would run against the live app with real customers on it. Ask
  first, and prefer a staging instance.

## Next step

After a green performance gateway: **`compliance-check`** (legal), then
**`go-live`** (putting it online), then **`go-to-market`** (marketing).

`go-live` runs this again against the live instance — and that is the run whose
numbers actually count.
