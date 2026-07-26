---
name: security-gateway
description: The security check for this app. Scans it for holes — unprotected routes, access to other people's data (IDOR), secrets in the code, a bypassed IPN signature, an MCP tool that hands out too much, XSS, vulnerable packages, a misconfigured host — judges each finding by severity, fixes what has to be fixed and writes a report. Use it before the app processes real payments and customer data, after larger changes, and whenever somebody asks "is this safe?", "is this route protected?", "is there a secret in the code?".
---

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

Eight checks. You do not have to know which one you want.

| # | Check | What it looks at | Roughly |
|---|---|---|---|
| 1 | **`all`** | everything below, in the right order | 20–40 min |
| 2 | **`code`** | access control: who may see and change what | 10–15 min |
| 3 | **`pay`** | the money: IPN signature, idempotency, entitlements | 5 min |
| 4 | **`secrets`** | what must never be in git — and what harmlessly is | 5 min |
| 5 | **`deps`** | the packages and their known holes | 2 min |
| 6 | **`api`** | the endpoints that answer without a session | 5–10 min |
| 7 | **`host`** | environment, headers, the live configuration | 5 min |
| 8 | **`fix`** | fix the findings of the last report | depends |

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
6. **`host`** — only meaningful once there is a host; skip it with a note before
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

### Protection is opt-in, and that is the trap

Only the paths in `proxy.ts`'s `matcher` are guarded — today `/dashboard/:path*`
— and `auth.config.ts` returns true for everything else. **A route that is in
neither list is public by accident, not by design.**

Public on purpose, and this list is exhaustive: the home page, `/login`,
`/plans`, `/optin/*`, `/account/confirm-email`, `/api/ipn`, `/api/mcp`,
`/api/healthz`, `/api/readyz`, `/api/cron`.

So: list every route in `app/`, subtract the matcher, subtract that list. What
is left is a finding — **HIGH**, and **CRITICAL** if it renders customer data.
When a route is public on purpose, it goes into the list above in the same
change, or the next audit reads it as an accident.

`/account/confirm-email` is authenticated by its single-use token, not by a
session, because the mail carrying it is read on whichever device holds the
inbox. Putting it behind the matcher breaks the feature for exactly the person
it exists for. Leave it.

### IDOR — reaching another member's data

Every query on a customer-owned table needs an ownership condition. The column
is **`memberId`** — on `orders`, `grants`, `subscriptions`, `tokenAccounts`,
`chatMessages`, `mcpKeys`, `impersonations`. `userId` exists only on the Auth.js
`accounts` and `sessions` tables and is **not** an ownership column; grepping
for it finds nothing and proves nothing.

Read every server action and every route handler and ask one question: *does
this query say whose row it is?* A `where eq(orders.id, id)` with an id from the
form and no `memberId` is a **CRITICAL**.

**A server action is an HTTP endpoint.** The button only rendering for a
signed-in member is cosmetics; anybody can POST to the action directly. So every
action re-checks `auth()` itself — `app/plans/actions.ts` is the pattern to
copy. An action that trusts the page that rendered it is a **HIGH**.

**Admin actions need `requireOwner()`** (`lib/authz.ts`), inside the action, not
in the page. Everything under `app/dashboard/admin/` is in scope.

### Entitlement, not billing tables

What a member may use is answered by `hasPlan(memberId, productKey)` from
`lib/entitlements/manage.ts`. A hand-rolled query over `orders` or
`subscriptions` is a finding — **HIGH**, and not a stylistic one: those tables
answer a different question, and a cancelled subscription that still has paid
time left reads as "blocked" there. See `docs/entitlements.md`.

No cached access booleans either — not a flag on the user row, not a claim in
the session. Entitlement is derived per request; a stored yes survives the
chargeback that should have revoked it.

### The MCP server, if it is on

Check `config/mcp.json` → `"enabled"`. It ships off; if it is on, go through
`lib/mcp/tools.ts` tool by tool. It has no session, so nothing above applies to
it automatically. See `docs/mcp.md`.

- **No tool takes a member, user or account id as an argument.** The account is
  `ctx.memberId`, proven by the key. Arguments are written by a model reading
  text somebody else may have authored — an id among them is an IDOR with a
  language model holding the pen. **CRITICAL.** `lib/mcp/tools.test.ts` checks
  the obvious spellings; read the schemas yourself for the ones it cannot guess.
- **`readOnly: true` is a lie on anything that writes, charges, mails or calls a
  paid API.** It is the boundary a `read`-scope key is measured against, so a
  wrongly-flagged tool is a read-only key that can spend somebody's balance.
  **HIGH.**
- **Every argument is re-validated in the handler.** `inputSchema` is a hint to
  a model, not a check — treat `args` exactly like a `FormData`. **HIGH.**
- **No operator capability is exposed.** No tool blocks a user, adjusts a
  balance, grants a plan, deletes a record, sends mail or places an order.
  Anything `requireOwner()` guards belongs nowhere in that file. **CRITICAL.**
- **No tool returns a secret** — no API key, no `passwordHash`, no other
  member's data. **CRITICAL.**

### Signing in as a user, if it is on

Check `config/impersonation.json`. This feature deliberately rewrites the
subject of a signed-in session, so it **will** look like an auth bypass on first
reading. It is a legitimate, bounded support feature — the description is in
`guardrails`. What you are auditing is whether it is still bounded. Each of
these is a finding:

- **The `jwt` callback believes the update payload.** `/api/auth/session` takes
  a POST from any signed-in user and its body reaches that callback.
  `lib/impersonation/session.ts` must look the record up by id and rewrite the
  session only when `row.operatorId === token.sub`. A `token.sub =` fed from
  anything in the payload is a full account takeover — any member becomes any
  other, including an owner. **CRITICAL.**
- **The record is written after the session changes**, or not at all. The row
  *is* the authorisation, not a log line. Reordering it removes the check.
  **CRITICAL.**
- **An owner can be impersonated.** `canImpersonate()` must refuse
  `target.role === "owner"` in the rule, not merely by hiding the menu entry.
  **HIGH.**
- **The exit action calls `requireOwner()`.** This one is inverted: during an
  impersonation the session's role *is* the member's, so an owner check there
  locks the operator inside a customer's account. Its absence is correct.
- **The switch fails open.** A malformed `config/impersonation.json` must count
  as off. **HIGH.**
- **The banner is conditional on a route.** It belongs in the root layout, on
  every page including the public ones. **MEDIUM.**
- **Automatic top-up is not suppressed** during an impersonation
  (`lib/tokens/spend.ts`) — a support click would charge a customer's card.
  **HIGH.**

`lib/impersonation/guard.test.ts` asserts several of these against the source
text. If it has been deleted or weakened, that is the finding.

### Input, output, and the four fingerprints

- **Validate every input.** Server actions and route handlers take
  `FormData`/JSON from the network. Required fields, types, limits — `zod` is
  already a dependency. Missing validation on anything that reaches the database
  is **HIGH**.
- **Drizzle only.** Queries go through Drizzle (parameterized). A template
  literal inside `sql\`\`` carrying a user value is SQL injection — **CRITICAL**.
  `db/sql-cast.test.ts` guards part of this.
- **No `dangerouslySetInnerHTML`.** The assistant's answers are markdown, and
  `lib/ai/markdown.ts` parses them into React elements precisely so that no HTML
  is ever interpreted — the comment at the top of that file says so. If anyone
  has "improved" it with a markdown library plus `dangerouslySetInnerHTML`, that
  is **CRITICAL**: the text comes from a language model that read the
  customer's own handbook and the customer's own messages, and prompt injection
  into a DOM sink is the whole attack. Same for any place foreign text is
  rendered — buyer names, product titles, chat content.
- **Compare secrets in constant time.** Any token, API key, HMAC or signature
  compared with `===`, `!==` or `strcmp` is a timing side channel — the value
  becomes guessable byte by byte. The template does this correctly in
  `lib/digistore/ipn.ts`, `lib/mcp/keys.ts` and `lib/credentials/hash.ts`
  (`crypto.timingSafeEqual`, after a length check). A new comparison that does
  not is **HIGH**.
- **Random that is not random.** `Math.random()` or `Date.now()` as the source
  of a token, key, password or invite code is guessable. `randomBytes` /
  `randomUUID` from `node:crypto`. **HIGH.**
- **Do not log secrets or personal data.** Tokens, passwords, API keys, buyer
  addresses in `console.log` — **MEDIUM**, **HIGH** if it is a live credential.
- **Never pass server-side values into client components.** A `"use client"`
  component receiving an env value as a prop ships it to the browser.
  **CRITICAL** if it is a secret.

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

**Run the tools you have.** `gitleaks detect --source . --verbose` if it is on
the machine — the template ships a `.gitleaks.toml` for it. Otherwise work from
`git grep` and the checks below; the discipline does not depend on the tool.

**Skip these without further checking** — they are not secrets:

- Anything containing `_test_`, `_sandbox_`, `test-`, `sandbox-` — sandbox keys
  move no money.
- Publishable and public keys: `pk_live_*`, `pk_test_*`, `-----BEGIN PUBLIC KEY-----`,
  `ssh-rsa`/`ssh-ed25519`, any `*.pub`.
- **`BUILT_IN_DEVELOPER_KEY` in `scripts/ds24/connect-api-key.mjs`.** A
  Digistore24 developer key carries no account permissions — it only identifies
  the application to `requestApiKey`, like an OAuth client ID. The key that
  carries permissions only comes into being when the merchant grants access. Do
  not remove it, do not obscure it; the scanner markers on that line are part of
  it. A scanner *will* raise this. It is not a finding.
- The placeholder values in `.env.example`.

**Do check** `sk_live_*`, `-----BEGIN … PRIVATE KEY-----`, and any secret sitting
in a `NEXT_PUBLIC_*` variable — that prefix ships the value to every browser, so
a real key there is **CRITICAL** whatever else is true.

**For everything left, verify the value:**

```bash
git grep '<distinctive tail of the value>'                    # in the tree now?
git log -p --all -S '<distinctive tail of the value>' -- <file>   # ever in history?
```

Search a distinctive tail, not the whole key. Then:

| In the tree now | In history | Rotated | Verdict |
|---|---|---|---|
| yes | — | — | 🚨 **CRITICAL** — it is in the repo right now |
| no | yes | no / unknown | ❌ **HIGH** — it was exposed and still works. Rotate it. |
| no | yes | yes | **no finding** — the old value is dead. Cleaning history is hygiene, offer it. |
| no | no | — | **no finding** — this is what correct looks like |

When rotation is unclear, **ask** — one sentence: "was this key rotated at the
provider after it was committed?" Do not guess CRITICAL.

Also check, regardless of tools:

- `.env` is in `.gitignore` and `git log --all -- .env` is empty.
- Every new variable is in `.env.example`, with a placeholder and never a value.
- The Digistore24 credentials live in the environment and are read through
  `lib/digistore/settings.ts` — not in the database, not in the code. There is
  deliberately **no UI for entering keys**, and adding one is a finding: it is
  attack surface for a problem that does not exist.
- Nothing secret in `messages/de.json` / `messages/en.json` — they are bundled.

**The fix, when it is real:** rotate at the provider first, then remove from the
code, then `.gitignore`, then clean the history (`git filter-repo`, BFG). In that
order. Cleaning history first leaves a live key out there.

## 5 · `deps` — the packages

```bash
npm audit --omit=dev --audit-level=high
```

Dev-only vulnerabilities do not ship and rarely deserve a launch delay — say so
rather than counting them. For the ones that do ship:

- Fix by update. `npm audit fix` for the easy half; a pinned major for the rest.
- After any update: `node run.mjs test`. An update that breaks the build is not
  a fix.
- A transitive dependency with no fixed version goes in `overrides` in
  `package.json` — the template already uses that mechanism.
- Framework versions current and patched: Next.js and `next-auth` above all.
  A Next.js version behind a security release is **HIGH** on its own.

Severity comes from npm, but judge it against this app: a ReDoS in a package
that only ever parses your own config is not the same as one in the request
path. Say which it is.

## 6 · `api` — the endpoints that answer without a session

Needs the app running — `node run.mjs start`, then work against
`http://localhost:3000`. Seven route handlers exist; go through them.

| Route | What it must do |
|---|---|
| `/api/ipn` | 403 on an invalid signature, always. Send it a payload with a broken `sha_sign` and watch. |
| `/api/mcp` | 401 without a bearer key, 401 on a wrong one, scope enforced on write tools. |
| `/api/chat` | signed-in only, and rate-limited or token-metered — it costs money per call |
| `/api/cron` | secret-guarded (`docs/cron.md`); an open cron endpoint is a free job runner |
| `/api/healthz` `/api/readyz` | public on purpose, and must leak nothing — no versions, no env, no DB error text |
| `/api/auth/*` | Auth.js. Do not modify; do check that nothing was |

Then the questions that apply to all of them, and to every server action:

- **Another member's id in the request** — does it come back with data?
  (**CRITICAL** if yes.) Try it: two accounts, one id, one session.
- **A method nobody thought about.** `DELETE` on a route that only implemented
  `GET` — Next.js returns 405 by itself, but a handler exported by accident does
  not. **HIGH.**
- **What comes back that should not.** `passwordHash`, an email that belongs to
  someone else, an internal id, a stack trace, a raw database error. Over-fetching
  is the quiet one: returning the whole row when the page shows a name.
  **MEDIUM**, **HIGH** with personal data.
- **Rate limits where they are missing.** `lib/rate-limit.ts` covers sign-in and
  address-change mails. Anything else a stranger can trigger repeatedly and that
  costs money or sends mail needs one too — chat above all. **MEDIUM**, and note
  the documented limitation: the limiter is per process, so several instances
  multiply every limit.
- **Error responses in production** say what went wrong, not where. A stack
  trace in a 500 body is **MEDIUM**.

## 7 · `host` — configuration and the live environment

Before the first deploy most of this is not yet answerable — say so and move on
rather than inventing findings.

- **Security headers.** `next.config.ts` sets `Referrer-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options` and HSTS on every response. Check
  they are still there and actually arriving (`curl -sI`). There is deliberately
  **no CSP** — Next.js emits inline scripts, so a useful policy needs per-request
  nonces, and a `unsafe-inline` policy pasted in to look green is not protection.
  Its absence is a documented decision, not a finding.
- **HTTPS everywhere**, `APP_URL` on `https://`, valid certificate. All four
  hosts in `docs/DEPLOY.md` do this for you; verify rather than assume.
- **Secrets live in the host's secret store**, not in a committed file, not in
  the build image. `AUTH_SECRET` is different in production than locally.
- **`APP_ENV`** is `production` on the live instance. `lib/env-guard.ts` refuses
  to start without a mail transport there — that refusal is a feature.
- **The database is not on the public internet** without a password and TLS, and
  the deploy runs migrations before the new version serves traffic
  (`docs/DEPLOY.md` → Migrations).
- **`/api/cron`'s secret is set** at the host, not left at its default.
- **Backups exist** and somebody has restored one at least once. Untested
  backups are **MEDIUM** the day before they are needed and CRITICAL the day
  after.

## 8 · `fix` — fixing what was found

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
