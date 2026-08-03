<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The HTTP API — your app as a backend for your own programs

This app can expose a REST surface under `/api/v1`: your **own** programs —
typically a mobile app, see [`docs/mobile.md`](mobile.md) — sign in, get a
key, and then read and write on a member's behalf, with exactly the rights
that key carries.

It ships **switched off**. Turning it on is a decision that your product HAS
an external client, and the skill `mobile-companion` walks through it.

---

## The short version

| | |
|---|---|
| Endpoints | `/api/v1/…` — plain JSON over HTTPS, see the table below |
| Authentication | `Authorization: Bearer ds24api_…` — one key per member |
| Getting a key | `POST /api/v1/auth/token` (email + password), or the **App keys** card on `/dashboard/account` |
| Switch | `"enabled": true` in `config/api.json` |
| Errors | `{ "error": "<code>", "detail": "…" }` — the code is the contract, the sentence may change |
| Check it | `node run.mjs api-check` (`--live` mints a key and really calls it) |

---

## Switching it on

```json
// config/api.json
{
  "enabled": true,
  "requiresPlan": null
}
```

Read it only through `isApiEnabled()` / `apiConfig()` (`lib/api/config.ts`),
never by re-reading the JSON. A malformed file counts as **off** — the failure
mode of this switch is an open endpoint, so every doubt falls towards closed.
`requiresPlan` names a Product Key from `config/digistore-products.json` when
the API itself is a paid feature; `null` means every member. A token package
is refused here for the usual reason: a balance is not an entitlement.

While the API is off, every `/api/v1` path — the token endpoint included —
answers **404**, as if it did not exist. That is the shipped state, and the
deploy test asserts it against a real boot.

## Getting a token

**The password grant.** A program posts email and password once and stores the
key it gets back:

```
POST /api/v1/auth/token
Content-Type: application/json

{ "email": "member@example.com", "password": "…",
  "name": "My phone", "scope": "read", "lifetimeDays": 90 }
```

`201` answers `{ id, name, scope, expiresAt, secret }` — **`secret` is the
key, shown exactly once.** The table stores a SHA-256; nobody can read it
back, so a lost key is replaced, not recovered. Defaults when omitted: scope
`read`, lifetime 90 days. `lifetimeDays: null` means no expiry. Every sign-in
failure is the same `401` — wrong password, unknown address and blocked
account are indistinguishable on purpose; only `429` (rate limited) stands
out. On top of the sign-in's own limits, minting is metered per origin
(`TOKEN_MINT_LIMIT`): a credential factory deserves a narrower door than a
read.

**Members without a password** (magic-link sign-in only) cannot use this
endpoint — deliberately, not accidentally. They create a key on
`/dashboard/account` under **App keys** and paste it into their program, or
set a password there first. A device-code flow was considered and rejected
for v1: it needs a pending-authorization table, polling endpoints and a
user-code screen, and the dashboard card already covers the case.

**No refresh tokens.** Keys are long-lived and revocable; rotation is
"create a new one, revoke the old one". Scopes are `read` and `write`, and a
`read` key cannot reach any endpoint that changes data or spends money — the
refusal lives in the call path (`guardApi`), never in what is merely listed.
Per-domain scopes were considered and rejected for v1; the upgrade path is a
`scopes` column, not a redesign.

## The endpoints

Every date is an ISO-8601 string. `accessUntil` stores the last millisecond
of a day in UTC — render it pinned to `timeZone: "UTC"`, exactly like the
dashboard, or every viewer east of Greenwich reads the next day.

| Endpoint | Method | What it answers |
|---|---|---|
| `/api/v1/auth/token` | POST | sign in → key (above) |
| `/api/v1/me` | GET | `{ id, email, name, role, createdAt }` |
| `/api/v1/me` | PATCH ✎ | rename yourself: `{ "name": "…" }` (`null` clears). Email has **no** endpoint — an address changes by mail confirmation only (`docs/auth-setup.md`), and that flow cannot ride a bearer key |
| `/api/v1/entitlements` | GET | `{ entitlements: [{ productKey, source, accessUntil }], paused: […] }` — from `grants`, never a billing table; `paused` is what a missed payment suspended, so the app can say "paused" instead of nothing |
| `/api/v1/tokens` | GET | `{ balance }` — zero for an account that never bought tokens |
| `/api/v1/tokens/ledger` | GET | `{ entries: […], capped }` — the member's own bookings; operator adjustments come back with `label: null` |
| `/api/v1/billing` | GET | `{ nextPaymentAt, orders: [{ …, invoices: […] }] }` — read-only; `rebillingStopUrl`/`renewUrl` are Digistore24's own self-service pages, billing state changes THERE and arrives back via IPN |
| `/api/v1/chat` | GET / DELETE ✎ | the assistant's transcript / clear it |
| `/api/v1/chat/messages` | POST ✎ | ask the assistant — the same NDJSON stream as the web chat (`{"type":"delta"}` lines, then `done` or an in-stream `error`), from the same pipeline, drawing on the same per-member rate ceiling |
| `/api/v1/media` | GET / POST ✎ | own uploads / upload (`multipart/form-data`, field `file`; answers the media domain's codes) |
| `/api/v1/media/{id}` | GET | one item — `307` to a signed URL on the cloud driver; 404 for missing AND forbidden alike, deliberately |

✎ = needs a `write`-scope key.

**There is deliberately no token-spend endpoint.** The price of an operation
is computed in code (`spendTokens`, CLAUDE.md) — an endpoint taking an amount
from the wire would hand the price to the caller. Paid API operations charge
internally, the way the MCP tools do.

## The envelope, and what a client may rely on

Success bodies are plain JSON, no wrapper. Errors are:

```json
{ "error": "planRequired", "detail": "This account's plan does not include the API." }
```

`error` is stable and English — match on it. `detail` is a courtesy for the
developer reading a network tab and may change wording at any time. The codes
(`lib/api/rules.ts`): `apiDisabled` `badRequest` `forbidden` `internal`
`notFound` `originForbidden` `planRequired` `rateLimited` `scopeReadOnly`
`unauthorized` — appended to, never renamed. The media endpoints answer the
media domain's own codes (`lib/media/rules.ts`) in the same envelope shape,
and the chat stream carries the chat codes (`lib/ai/rules.ts`) — one refusal
vocabulary per domain, shared with the web app by construction.

`/api/v1` is **additive**: new fields and new endpoints may appear at any
time, nothing documented here is removed or retyped. A breaking change would
be a new `/api/v2` folder beside this one, not an edit to v1.

## ⚠️ Every route guards itself

**`proxy.ts` protects `/dashboard` and nothing else. Everything under
`app/api/` is PUBLIC until it protects itself.** For the v1 surface that
protection is `guardApi()` (`lib/api/guard.ts`), called as the **first line**
of every handler:

```ts
export async function GET(request: Request): Promise<Response> {
  const g = await guardApi(request);           // ← first line, always
  if (!g.ok) return g.response;
  // g.memberId, g.scope, g.role — proven, never from the request
}
```

It checks, in order: origin (DNS-rebinding guard) → feature switch (404 when
off) → failed-auth limit → the bearer key, audience-bound (`ds24api_` only —
an MCP key never opens this surface, nor the reverse) → per-member call limit
→ `requiresPlan`/`hasPlan()` → write scope where the handler asked for it.
Every flavour of "no key" is one identical 401; the reasons live in the
server log only.

Two invariants ride on that, and they are the surface's whole security story:

- **No endpoint ever takes a member id.** The account read or written is the
  key's owner, bound by `authenticate()` before the handler runs — the same
  guarantee `spendTokens` gives a Server Action. An id in a query string or
  body is ignored by construction.
- **`app/api/v1/guard-presence.test.ts` fails the build** on any v1 handler
  that does not call `guardApi` (the token endpoint is the named exception —
  its caller has no key yet; its protection is the password check plus the
  mint meter). The middleware footgun is structural, not a review item.

## Adding an endpoint

Deliberately a section, not a skill — it is four steps, and the fourth is the
one that keeps the surface honest:

1. **Put the logic in `lib/<domain>/`**, split rules/manage like everything
   else. The endpoint must stay a thin caller — if the web page and the API
   cannot share the function, the function is in the wrong place.
2. **Create `app/api/v1/<name>/route.ts`**: `runtime = "nodejs"`,
   `dynamic = "force-dynamic"`, `guardApi()` first line — `{ scope: "write" }`
   for anything that changes data, spends money or sends mail. Serialize every
   `Date` to ISO at the boundary.
3. **Answer `apiError(code, detail?)`** from the existing vocabulary; extend
   `API_ERROR_CODES` only for a genuinely new kind of refusal.
4. **Write the colocated test**: guard-first (a refused request reaches no
   query), the response shape, and — for anything member-scoped — that a
   `memberId` in the request changes nothing. `guard-presence.test.ts` picks
   the new file up by itself.

## No CORS, on purpose

No `/api/v1` response carries `Access-Control-Allow-Origin`, so a **browser**
on another origin cannot call this API — the browser has the cookie surface,
and a cookie-bearing cross-origin API is a CSRF story this app refuses to
start. Native apps and servers are not subject to CORS and simply work. The
`Origin` header IS still checked when present (DNS-rebinding guard, shared
with the MCP endpoint) — absent is fine, foreign is 403.

## Limits, and one caveat worth knowing

Per member: 120 calls/min across all keys (metering per key would let anybody
multiply their own ceiling by minting more). Per origin: 30 failed
authentications / 15 min, 10 token mints / 15 min. Chat and media draw on the
same per-member buckets as the web app — one member, one ceiling, regardless
of the door. ⚠️ All of it counts **in process memory**: behind a load
balancer every limit multiplies by the instance count. Known, accepted, and
the same trade the sign-in limits already make — a Redis-backed limiter is
the upgrade path if it ever matters.

## What this is not

Rejected for v1, each on purpose — reread the reason before building one:

- **OAuth / device-code flow** — disproportionate machinery; the dashboard
  card covers the passwordless case.
- **Refresh tokens** — long-lived revocable keys, rotation by replacement.
- **Per-domain scopes** — `read`/`write` mirrors what the dashboard can do;
  the upgrade is a column, not a redesign.
- **A token-spend endpoint** — the price is computed in code, never taken
  from the wire.
- **CORS headers** — see above; browsers use the cookie surface.
