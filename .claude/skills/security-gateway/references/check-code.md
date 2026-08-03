<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# `code` — the check recipes

Part of the skill `security-gateway`, check 2 (`code` — access control).
SKILL.md holds the file list and the dispatch; this file holds the per-surface
recipes. Severities and the format of a finding are defined in SKILL.md.

### Protection is opt-in, and that is the trap

Only the paths in `proxy.ts`'s `matcher` are guarded — today `/dashboard/:path*`
— and `auth.config.ts` returns true for everything else. **A route that is in
neither list is public by accident, not by design.**

Public on purpose, and this list is exhaustive: the home page, `/login`,
`/plans`, `/optin/*`, `/account/confirm-email`, the legal pages
(`/impressum`, `/datenschutz`, and `/agb` / `/widerruf` where they exist),
`/api/ipn`, `/api/mcp`, `/api/healthz`, `/api/readyz`, `/api/cron`.

The legal pages are public **because they have to be** — § 5 DDG wants the
Impressum easily reachable, and a privacy policy behind a sign-in cannot be read
by the person deciding whether to sign in. Do not "fix" them into the matcher.

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
