<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Digistore24 setup scripts

One-off, **idempotent** setup tasks that are not part of the app's runtime.
They can be run by hand or by Claude Code (skill `setup-digistore`). Plain Node
ESM — no build needed.

## Prerequisites (env)

```bash
export DIGISTORE_API_KEY="…"   # writable/developer key
```

You fetch the API key with `node run.mjs ds24-connect` (= `connect-api-key.mjs`): the
script opens the browser, you confirm at Digistore24, and the key is written
into the `.env` as `DIGISTORE_API_KEY`.

## Synchronizing products from the registry (recommended)

For apps with several offers (subscription plans + token packages),
**`config/digistore-products.json`** is the source of truth. `sync-products.mjs`
creates each product via `createProduct` or updates it via `updateProduct` and
writes the `productId` back into the config. **The price is NOT set on the
product** (`data[amount]` is deprecated and discarded) — price and interval stay
in the registry and travel with the checkout call as `payment_plan[...]`
(`lib/digistore/checkout.ts`). Do **not** maintain payment plans in the DS24 UI;
the price would then live in two places. All environments use the same live
products.

```bash
# The normal case — creates/updates and registers the IPN:
node run.mjs ds24-sync

# Look first, change nothing:
node run.mjs ds24-sync --dry-run

# A single product only:
node run.mjs ds24-sync --key pro
```

`node run.mjs ds24-sync` adds `--apply` by itself; the scripts underneath keep the dry
run as their default, so a direct `node scripts/ds24/sync-products.mjs` still
changes nothing. `--dry-run` beats `--apply` wherever both turn up.

## localhost and Digistore24 (`_public-url.mjs`)

Digistore24 stores **public https URLs only**. Handing it the address your app
actually runs on locally ends the sync right there:

```
DS24 API error (updateProduct): Please only use secure URLs with https://.
Change this URL accordingly: http://localhost:3000/optin/[ORDER_ID]
```

So every localhost URL travels as a redirect address that leads back to your
machine — the thank-you page above, the return address of `node run.mjs ds24-connect`
likewise:

```
http://localhost:3000/optin/[ORDER_ID]
  → https://ds24-appkit.com/redir/?port=3000&path=/optin/[ORDER_ID]
  → (302) http://localhost:3000/optin/[ORDER_ID]
```

The page behind it is static and never sees a key or a purchase; the target host
is hard-wired to localhost, only port and path come from the URL. The address
itself is in `lib/digistore/config.mjs`.

**The IPN endpoint is the exception.** That URL is called by the *Digistore24
server*, and its localhost is not yours — the redirect cannot help, which is why
`ipn-setup.mjs --auto` skips the IPN locally instead. Use `node run.mjs ds24-tunnel`.

Request approval (go-live) — sets `approval_status=pending` per product. The
reseller/marketplace the approval is requested from follows from the
**language**: German → Germany reseller (id 1), otherwise USA reseller (id 2).
Overridable via `--lang`, `--reseller` or `--siteowner`:

```bash
node run.mjs ds24-approval --apply                    # reseller from language (default: DE → 1)
node run.mjs ds24-approval --lang en --apply        # → USA reseller (id 2)
node run.mjs ds24-approval --reseller US --apply    # a specific reseller: DE|US|GB|IE
node run.mjs ds24-approval --siteowner <id> --apply # any (even private) marketplace
# a different status: --status requested
```

The reseller IDs are hard-coded in `_resellers.mjs` (source:
`https://www.digistore24.com/support/resellers.json` — practically never change).

**Before approval only test purchases.** New products are not approved at first;
to test the checkout from inside the app, the vendor sets the test-purchase
cookie once: <https://help.digistore24.com/hc/de/articles/23901169396241>.
You only request approval once the product description and the app are mature.

### A single product (the old way)

`create-product.mjs` creates a single base product (for the createBuyUrl route
without a registry). Idempotent via `name_intern`; `--update` updates it.

```bash
node scripts/ds24/create-product.mjs --saas "Paid Challenge" --plan "Gold" --apply
```

## Setting up the IPN connection (idempotent)

The **normal case** is `node run.mjs ds24-sync` — that creates products
*and* sets up the IPN (the call: `ipn-setup.mjs --auto`). The `--auto` mode
derives the IPN URL from `APP_URL` and picks a stable `domain_id`:
- **live/staging** (public domain) → from the host, e.g. `app-example-de-k7f2m9x1qc`;
- **development** → `local-<project name>-<random>`, so that a changing tunnel
  URL does not multiply the connection.

The value is written into the `.env` as `DIGISTORE_IPN_DOMAIN_ID` and stays
stable. `ipnSetup` is idempotent via this `domain_id`: an existing connection
is updated (duplicates removed), otherwise a new one is created. So the same
call is both the setup and the update — **only the `domain_id` decides which**:
keep it and the connection is updated, change it and a second connection comes
into being. The defaults for events
(payment/refund/chargeback/payment_missed/last_paid_day), timing (before the
thank-you page) and category (orders) already match the IPN handler. The
generated SHA512 passphrase ends up in the `.env` as
`DIGISTORE_IPN_PASSPHRASE`; if one is already set there, it is reused.

### The `domain_id` has to be unique — hence the random tail

Digistore24 finds a connection by **(merchant, API key, `domain_id`)** and
updates the row it finds. A generic value — `test-local-1`, `local-app`,
`myapp` — is therefore not a name but a **collision**: two of the vendor's own
projects that pick the same one do not get two connections, they take turns
overwriting one. The second `ds24-sync` re-points the first project's IPN at its
own address, and from then on the first project's purchases arrive nowhere. Both
sides report success; nothing anywhere reports the loss.

That is why a **derived** value ends in ten random characters
(`local-my-app-diw2hvnz73`). The readable part says which app it is, the tail is
what makes it unique. A value passed with `--domain`, or one already sitting in
the `.env`, is taken exactly as it is — **if you choose one by hand, put
something random in it yourself.**

### Which products the connection covers (`product_ids`)

`ipnSetup` takes `product_ids`, comma-separated: `product_ids=111,222,333`.
Digistore24's own default is `all` (the whole account).

`--auto` sends the **ids from the registry** (`config/digistore-products.json`,
after the product sync has written them back), because a vendor's account
usually holds more than this app: an older funnel, a second app, somebody else's
launch. Naming the ids keeps every connection to its own products — which is
what lets two apps of the same vendor be connected at the same time.

`all` is legitimate and is the fallback while nothing is synced yet: this app
records an order for an unknown product and **grants nothing** for it
(`resolveProduct()` in `lib/digistore/payment-event.ts` returns `null`), so
foreign purchases are ignored rather than mis-granted. What `all` costs is the
separation, not the safety.

```bash
node scripts/ds24/ipn-setup.mjs --auto --products 111,222,333 --apply
node scripts/ds24/ipn-setup.mjs --auto --products all --apply
```

IPN needs a **public https URL** (DS24 checks it with a GET for HTTP 200 — the
IPN route answers GET with "OK"; it refuses a 301/302 too, which is why the
`/redir/` bridge cannot serve here). In purely local development `--auto` skips
the IPN part. To test it locally, run **`node run.mjs ds24-tunnel`**: that opens a public
address onto the running app and registers it as the IPN endpoint in one go —
`APP_URL` stays untouched (a non-local value there would switch off the
development login).

In fact `--auto` opens one **itself** when `APP_URL` is local and no tunnel is
running, so plain `node run.mjs ds24-sync` sets the IPN up locally too. It says so while
it happens: an open tunnel makes the machine reachable from the internet.

The tunnel runs in the **background** (`tunnel.mjs`, state in `.dev/tunnel.*`);
`node run.mjs status` shows it, `node run.mjs stop` ends it. A running one is reused rather than
replaced. Never opened: on `--dry-run` (a preview must not publish the machine)
and with `--no-tunnel`. A public `APP_URL` (STAGING/PROD) wins over any
tunnel and never reaches this path.

By hand (a special case, fixed values instead of derivation):

```bash
# Dry run:
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de"

# Execute (DS24 generates & returns the passphrase, it is written into the .env):
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de" --apply

# Or pass an already existing passphrase (couple them identically):
node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
     --domain "app.example.de" --passphrase "<from the .env>" --apply
```

The IPN URL is always `https://YOUR-DOMAIN/api/ipn` — without further path segments.

## A note on API field names

All the calls used are verified against the real DS24 API sources:
`createProduct`, `updateProduct`, `listProducts`, `ipnInfo` and `ipnSetup`.
Both scripts are dry run by default; only `--apply` changes anything.
