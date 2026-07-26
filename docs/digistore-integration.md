# Digistore24: the integration, and the two shapes of app it serves

Three things connect this app to Digistore24, and they are the same three in
every app built on this template:

| | What it is | Where it lives |
|---|---|---|
| **The API key** | what lets the app call the Digistore24 API at all — fetched interactively through the browser, never typed into a form | `lib/digistore/settings.ts`, `scripts/ds24/connect-api-key.mjs` |
| **The IPN** | Digistore24's webhook. Every payment, refund, chargeback and cancellation arrives here, SHA512-signed | `app/api/ipn/route.ts`, `lib/digistore/ipn.ts`, `lib/digistore/payment-event.ts` |
| **The checkout** | `createBuyUrl` with a complete payment plan attached, so price and interval are decided by the app | `lib/digistore/checkout.ts` → `lib/digistore/buyUrl.ts` |

What differs between apps is **whose Digistore24 account the money lands in**,
and that is a fork with consequences all the way down to the database. Decide it
before you build billing, not after.

## Pick the shape first

| | **A — one vendor** | **B — platform** |
|---|---|---|
| Who sells | the operator of the installation, and nobody else | every user of the app, each through their own Digistore24 account |
| Whose account is paid | the operator's | the user's |
| How many API keys | exactly one, in the `.env` | one per connected user, in the database |
| Who connects | the operator, once, in the terminal | each user, in the app, whenever they like |
| Needs a **Developer** API key of its own | no | **yes** |
| Status in this template | **built. Nothing to design** | **not built.** This doc is the build guide |

**Shape A is the default and covers most apps.** "I sell a SAAS product" is
shape A. Someone signing up is a *customer*, and customers do not sell anything.
Build shape B only when the app's own users need to take money from *their*
customers — a course platform, a booking tool for coaches, a shop builder. If in
doubt, ask the one question that settles it: *does anyone other than you get
paid?* No → shape A.

Do not build shape B "just in case". It multiplies the API key, the IPN
passphrase, the product list and the order table by the number of tenants, and
every one of those is money-relevant.

---

# Shared mechanics

True in both shapes; read this once.

## The API

Base `https://www.digistore24.com/api/call/<function>/format/json`, POST,
form-urlencoded, the key in the **`X-DS-API-KEY` header** — not as a parameter.
A response is only a success when `result === "success"`; anything else throws.
`lib/digistore/client.ts` (app) and `scripts/ds24/_client.mjs` (scripts) are the
only two places that speak HTTP to Digistore24. Do not add a third.

Two traps that have both already cost a day here:

- **Booleans arrive as the strings `"Y"` / `"N"`.** Both are truthy in
  JavaScript, so `if (res.created)` is true even when nothing was created. Use
  `isYes()` (`scripts/ds24/_client.mjs`).
- **No mock fallback, ever.** A failed API call throws. A checkout that silently
  "succeeded" without a Digistore24 URL is a lost sale that looks fine in the
  logs.

Full function reference: <https://www.digistore24.com/api/docs/index.html>
(Swagger; the machine-readable spec is `openapi.yaml` next to it).

## How an API key comes into being

Digistore24 has no client-secret handshake. Instead there is an interactive flow
that a **developer key** starts on behalf of a vendor. A developer key carries no
account permissions of its own — it identifies the *calling application*, the way
an OAuth client id does. Only the vendor's approval in the browser mints a key
with permissions, and that key belongs to the vendor's account.

```
requestApiKey(permissions, return_url, …)     ← authenticated with the DEVELOPER key
    → { request_url, request_token }
       send the vendor's browser to request_url; they sign in and approve
retrieveApiKey(token = request_token)          ← authenticated with the DEVELOPER key
    → { api_key, request_status: pending | aborted | completed, note }
```

- `permissions` is `read-only` or `writable`. **This template needs
  `writable`** — it creates products and generates checkout links, and both
  write.
- **`retrieveApiKey` is a question, not a delivery.** A not-yet-approved request
  answers `result: "success"` with `request_status: "pending"`, so asking again
  is the documented way to wait. This is why nothing has to be delivered to the
  waiting machine, and why `connect-api-key.mjs` needs no local web server.
- `return_url` decides only where the browser is left standing afterwards. It is
  **not** how you learn the approval happened — do not build on that.
- Digistore24 accepts **public https URLs only**, for `return_url` and
  `site_url` alike. An `http://localhost` is rejected outright.
- Undocumented but real: on some accounts `retrieveApiKey` also returns
  `thankyou_page_key`, which is usable as the IPN passphrase. `connect-api-key.mjs`
  saves it when it is there.
- **Disconnecting** is the API function `unregister`, called with **that
  vendor's** key (not the developer key). It deletes the key server-side
  *together with the IPN connections belonging to it*. Delete your stored copy
  afterwards.

Reference: [How to generate an API key interactively](https://dev.digistore24.com/hc/en-us/articles/32486158815121-How-to-generate-an-API-key-interactively).

## The IPN

`app/api/ipn/route.ts` does three things and nothing else: verify the SHA512
signature, answer the connection test with `OK`, hand a verified payload to
`onPaymentEvent()`. The signature check stays at the edge and stays first.

- **Fail closed.** No passphrase or a bad signature → `403`, nothing is
  processed. Never loosen this.
- **Digistore24 retries until it gets a 200.** So a handler that throws is
  correct behaviour, and a handler that swallows an error silently loses a
  payment for good — the event is never redelivered.
- `ipnSetup` verifies the URL by **fetching it and insisting on HTTP 200**
  (a 301/302 is refused too), which is why the endpoint answers `GET` with `OK`
  and why localhost cannot be registered.
- Every event, every payload field and the exact signature algorithm:
  [Events](https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events).
  On a rejected IPN, do not guess — `node run.mjs ds24-ipn-verify` recomputes
  the signature over the raw body that actually arrived.

Fields worth knowing before you design anything:

| Field | Why it matters |
|---|---|
| `merchant_id`, `merchant_name` | **who sold.** The vendor's numeric id and Digistore24 name |
| `ipn_config_api_key_id` | the numeric prefix of the API key whose connection this is — for key `12345-xxxx`, `12345`. **Present on order events, absent on the connection test** |
| `ipn_config_domain_id` | the `domain_id` passed to `ipnSetup` |
| `custom` | whatever the app sent as `tracking[custom]`, returned on *every* later event for that purchase. **`string(63)` — the whole budget** |
| `api_mode` | `live` or `test`. Test purchases of unapproved products arrive as `test` |
| `order_id` | stable across all transactions of one order → the idempotency key |

## The checkout

One base product per offer at Digistore24; **the price does not live there**.
The API discards `data[amount]`, so `priceCents`, `currency` and
`billingInterval` travel with each `createBuyUrl` call as `payment_plan[…]`.
There is a `createPaymentPlan` API and this template deliberately does not use
it — a stored plan puts the price in a second place and cannot do free trials,
upgrades, vouchers or per-link affiliate commissions. **One price, one place.**
Details: `docs/digistore-createbuyurl.md`, `docs/digistore-billing-modes.md`.

---

# Shape A — the developer is the only vendor

**This is what the template already is.** There is nothing to design, and the
work is three commands. Do not rebuild any of it.

## Set it up

```bash
node run.mjs ds24-connect    # browser approval → DIGISTORE_API_KEY into .env
node run.mjs ds24-sync       # products from config/digistore-products.json + IPN connection
node run.mjs ds24-approval --apply   # go-live only: request product approval
```

The agent runs these itself — see the skill **`setup-digistore`**, which is the
step-by-step guide including the local-tunnel and thank-you-page details. The
only step that cannot be automated is the vendor's single click in the browser.

## What "one vendor" means in the code

These are load-bearing decisions, not accidents:

- **The credentials live in the environment, not the database.**
  `DIGISTORE_API_KEY` and `DIGISTORE_IPN_PASSPHRASE`, read only through
  `lib/digistore/settings.ts`. `ds24ApiKey()` throws when unset;
  `hasDigistoreApiKey()` is the soft check for UI ("not connected yet").
- **There is no UI for entering a key, on purpose.** An input field for a secret
  is attack surface, and the key belongs to the operator of the installation, not
  to a signed-in user. Do not add one. Do not add a "settings" page for it.
- **Billing rows carry no vendor column.** `orders.memberId` is the *buyer*
  (`db/schema-digistore.ts`); one installation bills through one account, so
  namespacing rows by vendor would buy nothing but a trap.
- **One IPN connection, one passphrase, one stable `domain_id`**
  (`DIGISTORE_IPN_DOMAIN_ID`). `ipn-setup.mjs` is idempotent through it:
  delete-then-create against the same `domain_id`, so a changed URL updates the
  connection instead of multiplying it.
- **`tracking[custom]` names the buyer**, as `m:<memberId>;t:<token>;…`
  (`lib/digistore/custom.ts`). That is how a payment finds its owner even when
  the buyer paid under a different address. An unattributed payment is recorded
  but never credited — it is claimed at the buyer's first sign-in, or attached by
  hand under `/dashboard/admin/purchases`.

## The shipped developer key

`lib/digistore/config.mjs` carries `DIGISTORE_DEVELOPER_KEY`, the key that makes
`ds24-connect` work without anybody registering anything. It is openly in the
code because it is not a secret: it identifies the app kit, and it grants no
access to any account. **In shape A that is all you need.** In shape B it is not
(see below).

---

# Shape B — the app is a platform

**None of this exists in the template.** What follows is the complete design, so
that building it is a build and not a research project. Everything in *Shared
mechanics* above still holds; what changes is that every one of the three moving
parts becomes per-tenant.

Vocabulary, because conflating these two is the classic error of this shape:

- a **vendor** — a user of *your* app who connected their Digistore24 account and
  gets paid;
- a **buyer** — that vendor's customer. A buyer is usually **not** a user of
  your app at all.

`orders.memberId` in this template means *buyer*. A platform needs a second,
independent dimension for the vendor. Do not overload the first one.

## Step 0 — create your own Developer API key

At Digistore24, in the vendor view: **Settings → Account access → tab "API
keys" → "New API key" → API permissions: "Developer" → Save.** The key is then
shown in the "API key" field. Keep it in the platform's own environment, e.g.
`DIGISTORE_DEVELOPER_KEY` in the `.env`, and read it through a single accessor
next to `ds24ApiKey()`.

**Do not ship the app kit's key for this.** It belongs to the app kit's account,
it is public, and it can be rotated or revoked without anybody asking you. On top
of that, the values you pass to `requestApiKey` — `site_url`, `comment` — are
what the vendor reads on the approval page: they should name *your* platform.
A developer key is free, carries no permissions, and is the one piece of setup
that genuinely cannot be automated away.

## Step 1 — the connect flow, in the app

Replace the terminal script with two server-side steps. Read
`scripts/ds24/connect-api-key.mjs` first — it is the same flow, and its comments
name the mistakes already made once.

**Start (a server action on a "Connect Digistore24" button):**

1. `requestApiKey` with the **developer key**:
   `permissions=writable`, `return_url` = a page of your app, `cancel_url`,
   `site_url` = your platform, `comment` = something the vendor will recognise.
2. Store `request_token` against the signed-in user, with a timestamp. It is a
   one-shot credential — it stops working once used, aborted or stale.
3. Redirect the user to `request_url`.

**Finish.** Two ways, and you want both:

- when the browser comes back to `return_url`, call `retrieveApiKey(token)` once
  and finish immediately in the common case;
- and a **background retry** for the vendor who approved but never came back
  (closed the tab, lost the redirect). `pending` simply means "ask again later";
  `aborted` means give up and clear the request. Do not rely on the redirect
  alone — that is the single most likely way a platform ends up with vendors who
  approved and are still shown as unconnected.

**Store the key encrypted at rest**, per vendor, and never render it — not in a
form, not masked, not in a log line, not in an error message. Note the shape
`<numericId>-<secret>`: the prefix is not a secret and is worth storing
separately, because it is what `ipn_config_api_key_id` matches (step 2).

`APP_URL` must be a public https address for any of this to work. Locally,
`return_url` needs the same redirect detour every other localhost URL takes
here — see `lib/digistore/public-url.ts` and
`scripts/ds24/_public-url.mjs`.

## Step 2 — one IPN connection per vendor, with its own URL

Call `ipnSetup` **with that vendor's key** right after their key is stored.
Scoping is entirely by which key you authenticate with, so `domain_id` may stay a
constant (your platform's slug): it is unique *within* the vendor's account, and
reusing it means a reconnect replaces that vendor's connection instead of adding
a second one. `sha_passphrase: "random"` makes Digistore24 generate the
passphrase and return it; store it with the connection.

**Give each connection its own IPN URL** — `/api/ipn/c/<connectionId>`, with an
opaque, unguessable `connectionId`. The route then knows which passphrase to
verify against before it looks at the payload at all.

The alternative — one shared `/api/ipn` that routes on `ipn_config_api_key_id`
— looks tidier and does not work:

- **The connection test carries no `ipn_config_*` fields.** Its payload is
  `merchant_id`, `merchant_name`, `product_ids` and the signature, so a shared
  route has no signed way to pick a passphrase and every vendor's "Test
  connection" button fails.
- **`custom` cannot rescue it either.** It is `string(63)` and the buyer identity
  already uses roughly fifty of those; a vendor id does not fit. And it is absent
  from non-order events entirely.

So: **route by URL, verify with that connection's passphrase, and attribute the
sale to the vendor that connection belongs to.** Never to `merchant_id` out of
the payload.

That last sentence is the whole security model of this shape, and it is worth
being explicit about why. Each vendor can read their own passphrase in their
Digistore24 backoffice. With a shared passphrase, or with attribution taken from
a payload field, vendor A could post a validly signed IPN that claims to be
vendor B's sale — granting access, crediting tokens, or moving a subscription in
an account they do not own. Per-connection URL plus per-connection passphrase
plus attribution-by-connection makes that forgery structurally impossible rather
than merely unlikely. `ipn_config_api_key_id` is still worth checking against the
connection's stored key prefix on order events — as a cheap consistency check,
not as the routing decision.

## Step 3 — products belong to the vendor, not to the app

`config/digistore-products.json` holds one global `productId` per offer, written
back by `ds24-sync`. In a platform that is wrong by construction: each vendor's
products live in *their* account and have *their* ids. The registry stays the
source of truth for shape and price; the `productId` moves to a per-connection
table, and `ds24-sync` becomes a per-vendor operation triggered when a vendor
connects (or edits their offers), not a one-off command.

`productByDs24Id()` (`lib/digistore/products.ts`) has to become
per-vendor-scoped too, or two vendors with the same product id collide.

## Step 4 — checkout with the vendor's key

`createBuyUrl` called with vendor X's key produces a checkout that pays vendor X.
So `checkoutLinksFor` / `getOrCreateBuyUrl` need the vendor's key threaded
through, and the `buy_url_cache` key must include the vendor — **a cached URL
leaking across tenants sends money to the wrong account.** That is the single
most expensive bug available in this shape; write the test for it first.

## Step 5 — disconnect

Offer it, and mean it: call `unregister` with the vendor's key (which deletes the
key *and* its IPN connections at Digistore24), then delete your stored key,
passphrase and connection row. Keep the historical `orders` — they are financial
records. A vendor who cannot disconnect will do it from the Digistore24 side
instead, and then your app holds a dead key and quietly stops receiving events.

## What has to change in the template

| Today | Shape B |
|---|---|
| `DIGISTORE_API_KEY` in `.env` | `connections` table: vendor → encrypted key, key id prefix, passphrase, `connectionId`, status |
| `ds24ApiKey()` reads the env | `ds24ApiKeyFor(vendorId)` reads the table; the env holds only the developer key |
| no key-entry UI, on purpose | a connect/disconnect UI — still no key *input*, the browser flow stays the only way in |
| one `/api/ipn`, one passphrase | `/api/ipn/c/<connectionId>`, passphrase per connection |
| `orders` has no vendor column | `orders`, `subscriptions`, `token*` and `buy_url_cache` all carry the vendor |
| `productId` in the registry JSON | `productId` per connection |
| `/dashboard/admin/*` = the operator's view of everything | two levels: platform admin, and each vendor's own view of their own sales |

Everything else the template already does stays as it is and stays valuable: the
signature verification, the event→status mapping, idempotency by `order_id`, the
claim/attribution logic, the IPN log, the entitlement layer. None of it is
single-tenant by nature; it only needs the vendor threaded through.

## Two things this doc will not decide for you

- **How the platform earns.** The money goes to the vendor's account. Digistore24
  has affiliate commissions and Joint Venture / Cross Upsell shares (the IPN
  payload carries `amount_affiliate` and `amount_partner`), and a platform fee
  billed separately through your *own* account is shape A running alongside shape
  B. Which of these is permitted for your case is a question for Digistore24 —
  ask them before you build a revenue model on an assumption.
- **Who is liable for what.** A platform whose users sell to consumers has
  obligations the single-vendor case does not. See `docs/data-protection.md` for
  the data side, and the **`compliance-check`** skill.

---

# Reference

| Function | Authenticated with | Purpose |
|---|---|---|
| `requestApiKey` | developer key | start the interactive approval → `request_url`, `request_token` |
| `retrieveApiKey` | developer key | ask whether it happened → `api_key`, `request_status` |
| `unregister` | the vendor's key | delete that key and its IPN connections |
| `ipnSetup` | the vendor's key | create the IPN connection (`ipn_url`, `name`, `domain_id`, `sha_passphrase`) |
| `ipnInfo` / `ipnDelete` | the vendor's key | read / remove by `domain_id` |
| `listProducts`, `createProduct`, … | the vendor's key (`writable`) | products |
| `createBuyUrl` | the vendor's key (`writable`) | checkout URL + payment plan |
| `createBillingOnDemand` | the vendor's key (`writable`) | charge a stored mandate (token top-up) |

- API reference: <https://www.digistore24.com/api/docs/index.html>
- IPN events & payload: <https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events>
- Interactive key creation: <https://dev.digistore24.com/hc/en-us/articles/32486158815121-How-to-generate-an-API-key-interactively>
- In this repo: skill **`setup-digistore`** (shape A, step by step),
  `docs/digistore-billing-modes.md` (subscriptions & prepaid tokens),
  `docs/digistore-createbuyurl.md` (checkout links),
  `docs/entitlements.md` (what a purchase unlocks),
  `docs/environments.md` (local IPN, tunnels, DEV/STAGING/PROD).
