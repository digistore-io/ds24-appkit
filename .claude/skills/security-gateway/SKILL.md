---
name: security-gateway
description: The security check for this app. Scans it for holes — unprotected routes, access to other people's data (IDOR), secrets in the code, a bypassed IPN signature, an MCP tool that hands out too much, XSS, vulnerable packages, a misconfigured host — judges each finding by severity, fixes what has to be fixed and writes a report. Use it before the app processes real payments and customer data, after larger changes, and whenever somebody asks "is this safe?", "is this route protected?", "is there a secret in the code?".
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Security gateway — scan, judge, fix

This app handles **money and customer data**. Before it goes live, and after
anything larger changes, it gets checked properly: **scan → judge → fix →
verify → report.** Wave nothing through.

This is not a generic OWASP recital. It is written for **this** template —
Next.js 16, Auth.js, Drizzle on Postgres, Digistore24 for the money — and it
names the actual files, the actual columns and the actual routes. That is what
makes it worth more than a scanner: a scanner finds patterns, this finds the
holes this app can actually have.

The standing rules it checks against live in **`guardrails`** — that skill is the
single copy, this one is the audit against it. Where the two ever disagree,
`guardrails` wins.

## How to use this skill

Nine checks. You do not have to know which one you want.

| # | Check | What it looks at | Roughly |
|---|---|---|---|
| 1 | **`all`** | everything below, in the right order | 20–40 min |
| 2 | **`code`** | access control: who may see and change what | 10–15 min |
| 3 | **`pay`** | the money: IPN signature, idempotency, entitlements | 5 min |
| 4 | **`secrets`** | what must never be in git — and what harmlessly is | 5 min |
| 5 | **`deps`** | the packages and their known holes | 2 min |
| 6 | **`api`** | the endpoints that answer without a session | 5–10 min |
| 7 | **`host`** | environment, headers, the live configuration | 5 min |
| 8 | **`verdicts`** | judged elements: is the solution where the customer can read it | 5–10 min |
| 9 | **`fix`** | fix the findings of the last report | depends |

**How to dispatch:**

- If the user already said what they want ("check the secrets", "is `/api/mcp`
  safe?"), start that check. Do not show the menu first.
- Otherwise show the table, say that **`all`** is the one to run before a
  launch, and wait for an answer. A number, a name or a description all count.
- Before a launch, after a security-relevant change, or when in doubt: **`all`**.
- **You run the commands** — through your Bash tool, not by telling the user to
  type them. That is the rule for the whole template.

Every check ends the same way: findings with a severity → into the report →
offer to fix.

## What counts as a finding

**Severity — what it costs if it stays:**

| | Severity | Meaning |
|---|---|---|
| 🚨 | **CRITICAL** | Money or foreign data is reachable right now. Stop and fix it before anything else. |
| ❌ | **HIGH** | Fix before the launch, or before the next deploy if the app is already live. |
| ⚠️ | **MEDIUM** | Real, but it needs a second condition to become dangerous. Fix soon. |
| ℹ️ | **LOW** | Hardening. When you get around to it. |

**Confidence — only report what you can show.** A finding needs a code path you
have actually read, or a request you have actually sent. Anything resting on an
assumption about code you did not read goes into a separate **Worth a look**
section at the end of the report, not into the count. A confident wrong finding
costs the user an afternoon and teaches them to ignore the next report.

**The format of a finding — the same everywhere:**

```
🚨 CRITICAL — Admin action reachable without an owner check
   Where:    app/dashboard/admin/users/actions.ts:34
   Why:      A server action is an HTTP endpoint. Any signed-in member can POST
             to it and change another member's role.
   Fix:      requireOwner() at the top of the action, before the first query.
   Evidence: The action calls auth() but never checks session.user.role.
```

Four lines, always in that order. **Why** says what somebody gets out of it, in
plain words — not "Broken Function Level Authorization". **Fix** is a change
someone can make, not a principle.

## 1 · `all` — the full pass

Run the checks in this order. It is not arbitrary: the cheap ones that find the
worst things come first, so a launch that has to stop stops early.

1. **`secrets`** — the only finding class that stays dangerous after you fix it
   (the key is out; it has to be rotated). Always first.
2. **`deps`** — two minutes, and the fix is usually one command.
3. **`code`** — the long one, and the one that finds what scanners cannot.
4. **`pay`** — small, sharp, and the most expensive when wrong.
5. **`api`** — needs the app running (`node run.mjs start`).
6. **`verdicts`** — only where `ACTIVITIES` has entries; skip it with a note
   otherwise. It needs the production build, and it finds the failure every
   other check is blind to.
7. **`host`** — only meaningful once there is a host; skip it with a note before
   the first deploy.

Then: one report, one summary, one offer to fix.

If the environment has a security review tool (`/security-review`), run it as
well and fold its findings in. It reads the diff; this reads the app. They do
not overlap as much as they look like they do.

## 2 · `code` — access control

The deep read. Do not grep your way through this one — **read the files**. The
list is short because the template is fixed:

```
proxy.ts  auth.config.ts  auth.ts  lib/authz.ts  lib/roles.ts
lib/entitlements/manage.ts        lib/tokens/spend.ts
lib/mcp/tools.ts  lib/mcp/keys.ts
lib/impersonation/session.ts  lib/impersonation/guard.ts
lib/credentials/hash.ts  lib/rate-limit.ts  lib/email-change/manage.ts
every app/**/actions.ts           every app/api/**/route.ts
```

Plus everything the user has built themselves — their own pages under
`app/dashboard/`, their own tables in `db/`, their own actions. That is where
new holes come from; the template's own code has been through this before.

The recipes for this check are in **`references/check-code.md`** — which
routes are public on purpose and which by accident, IDOR and the `memberId`
ownership column, why entitlement is answered by `hasPlan(memberId,
productKey)` and never by a billing table, the MCP tool audit, the
impersonation audit, and the
input/output fingerprints (SQL injection, XSS, timing-safe comparison, weak
randomness, secrets shipped to the browser). Read that file in full while
running this check; it carries the severity for every finding.

## 3 · `pay` — the money

Small check, sharp questions. `lib/digistore/`, `app/api/ipn/route.ts`,
`lib/entitlements/`, `lib/tokens/`.

- **The SHA512 signature check is active and fail-closed** (`lib/digistore/ipn.ts`).
  Invalid signature → 403, no side effects, no "log it and carry on". A bypass —
  an early return, a `if (process.env.NODE_ENV !== "production")`, a commented
  check — is **CRITICAL**. This is the only thing standing between a stranger
  and free access to every product.
- **Order status is set through IPN events only.** Anything else writing
  `orders.status` is **CRITICAL**. <!-- not-an-access-check: this is the write rule; access is hasPlan() -->

- **Idempotency by `ds24OrderId`.** Digistore24 retries; a repeat must not book
  twice. On tokens the pair is `(accountId, ds24OrderId)`. **HIGH.**
- **No mock or demo fallback on an API error.** A `catch` that returns a fake
  successful purchase grants access for free. **CRITICAL.**
- **Prices come from Digistore24**, never from the client. A form field that
  decides what something costs is **CRITICAL**.
- **Auto top-up goes through `claimReloadSlot`** (`lib/tokens/spend.ts`) — the
  slot is what stops a double charge under concurrency. **HIGH.**

## 4 · `secrets` — what must never be in git

The rule that keeps this check honest: **a secret is a finding when the concrete
value is in git and has not been rotated.** Not the file — the value. A local
`.env` full of live keys that was never committed is the setup working as
designed, and reporting it as CRITICAL teaches the user to ignore you.

How to run it is in **`references/checks-secrets-and-deps.md`** — the tools,
the skip list (sandbox keys, publishable keys, the shipped developer key a
scanner *will* raise and that is not a finding), the two verification commands
and the verdict table, the checks that apply regardless of tools, and the fix
order (rotate at the provider first, clean the history last). Read it before
reporting anything as a leaked secret, and before fixing one.

## 5 · `deps` — the packages

```bash
npm audit --omit=dev --audit-level=high
```

Dev-only vulnerabilities do not ship and rarely deserve a launch delay — say so
rather than counting them.

How to fix the ones that do ship — updates, `overrides`, framework versions —
and the nine known dev-only eslint findings that are **not yours to fix** (two
obvious fixes are refused, with the measurements behind the refusal) are in
**`references/checks-secrets-and-deps.md`**. Read it before touching
`package.json` over an audit finding.

## 6 · `api` — the endpoints that answer without a session

Needs the app running — `node run.mjs start`, then work against
`http://localhost:3000`. Seven route handlers exist; go through them.

What each route must do, and the questions that apply to all of them and to
every server action — another member's id in the request, a method nobody
thought about, what comes back that should not, missing rate limits, error
responses that say too much — are in
**`references/checks-api-host-verdicts.md`**. Work through that file with the
app running.

## 7 · `host` — configuration and the live environment

Before the first deploy most of this is not yet answerable — say so and move on
rather than inventing findings.

The checklist is in **`references/checks-api-host-verdicts.md`** — security
headers (and why there is deliberately no CSP), HTTPS, secrets in the host's
secret store, `APP_ENV`, the database, the cron secret and backups.

## 8 · `verdicts` — is the solution where the customer can read it?

Only where `ACTIVITIES` (`lib/learning/activities.ts`) has entries. The
failure this section exists for is invisible to every other check: a judged
element whose answers reach the browser renders, returns 200 and stays green
everywhere — and is worthless.

The three steps — reading every entry's `load()` and its client components,
searching the built bundle for a known answer string, and the gates as
registry fields — are in **`references/checks-api-host-verdicts.md`**.

The rule behind all three is `guardrails` → *A verdict is never reached in
the browser*; the deeper audit (keyboard included) is the skill
`learning-activities`, item `check`.

## 9 · `fix` — fixing what was found

Fix in severity order: every CRITICAL, then every HIGH. MEDIUM and LOW are the
user's call — name what each one costs and let them decide.

For each fix:

1. **One finding, one change.** Small and targeted. A security fix bundled into
   a refactor cannot be reviewed and cannot be reverted.
2. **A test where a test is possible.** The template already tests the sharp
   edges — `lib/digistore/ipn.test.ts`, `lib/mcp/tools.test.ts`,
   `lib/impersonation/guard.test.ts`. A new guarantee gets a new test, or it
   will quietly disappear in six months.
3. **Verify the actual behaviour**, not the diff. Invalid signature → 403.
   Another member's id → nothing. Unauthenticated route → redirect to `/login`.
4. **`node run.mjs test`** at the end, and `node run.mjs smoke` if routes moved.
5. **Update the report** — what was fixed, what stays open, and why.

Anything you cannot fix without a decision (a rotation at a provider, a host
setting, deleting data) goes back to the user as one clear question.

## The report

Every run writes one, whether it found anything or not. That is what makes "did
we already do the security pass?" answerable in three months.

Write it to **`docs/reports/security-YYYY-MM-DD.md`** (add `-2`, `-3` if the day
already has one). Create the folder if it is not there.

```markdown
# Security report — 2026-07-26

Checks: secrets, deps, code, pay, api        (host: skipped — not deployed yet)
App:    local, commit a1b2c3d

🚨 CRITICAL 0   ❌ HIGH 2   ⚠️ MEDIUM 3   ℹ️ LOW 1   ✅ accepted 2

## Findings
(each in the four-line format, CRITICAL first)

## Fixed in this run
(what changed, with the commit or the file)

## Open
(what stays, and the reason — a decision, a cost, a dependency)

## Worth a look
(the low-confidence observations — no severity, no count)

## Accepted risks
(from docs/reports/security-accepted.md, with the reason and who accepted it)
```

Then say it out loud, in three or four sentences: what was found, what was
fixed, what is still open, and whether the app can go live. That last one is a
straight answer — "yes", or "no, because X". Not a summary of the report.

## Accepted risks

Some findings are deliberate. Rather than rediscovering them every run, they go
into **`docs/reports/security-accepted.md`** — create it the first time
something is accepted:

```markdown
| Finding | Where | Why accepted | By | Date | Review |
|---|---|---|---|---|---|
| Rate limiter is per process | lib/rate-limit.ts | single instance for now | Anna | 2026-07-26 | when scaled out |
```

Rules: an accepted risk is **not counted** in the severity totals and appears in
its own section of the report. Only the user accepts a risk — never you, and
never silently. If the `Review` condition has come true (the app was scaled out,
the date has passed), raise it again as a normal finding.

A CRITICAL is not accepted. If somebody wants to accept one, that is the moment
to say plainly what it means.

## STOP — get a human

Do not paper over these yourself. Report them and wait:

- A suspicion that customer data has actually leaked.
- A payment or signature check that was bypassed on the live instance.
- Access to another customer's data that already happened, rather than could.
- A live secret in a public repository.

`guardrails` has the full list and what to do.

## Next step

After a green security gateway: **`performance-gateway`** — the same shape, the
same report, for speed instead of safety.

`go-live` runs both again against the live instance, and it is right to: a local
pass proves the code, not the deployment.
