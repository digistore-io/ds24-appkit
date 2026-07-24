# Billing models: subscriptions + prepaid tokens

Besides one-off purchases (`createBuyUrl`, see `digistore-createbuyurl.md`) the
template supports two further models, on their own or **combined**:

1. **Subscription with a fixed payment** — recurring monthly/yearly.
2. **Usage billing with prepaid tokens** — the customer buys token packages;
   usage draws tokens down; at a low balance it is **topped up automatically**.

A typical cut: **base subscription (fixed) + usage-based tokens for the AI
usage**. Both run through the same DS24 account, IPN and checkout.

Code:
- `config/digistore-products.json` — **product registry** (source of truth): one
  DS24 product per offer; `productId` written back by `sync-products.mjs`.
- `lib/digistore/products.ts` — registry access (price, interval, features).
- `lib/digistore/checkout.ts` — **registry entry → checkout link**
  (`checkoutLinksFor`), on top of `createBuyUrl`.
- `lib/digistore/billing.ts` — `createBillingOnDemand`, `stopRebilling`,
  `getPurchase`, `listPurchases`.
- `lib/tokens/packages.ts` — token packages (from the registry, kind="token").
- `lib/tokens/account.ts` — balance, consumption, credit, auto-reload.
- `lib/entitlements/manage.ts` — **what a Member may use** (`hasPlan`,
  `entitlementsFor`). The access question is answered here, never from the
  billing tables below; see `entitlements.md`.
- `db/schema-tokens.ts` — `subscriptions`, `tokenAccounts`, `tokenLedger`.
- IPN: `app/api/ipn/route.ts` (credit + subscription upsert).
- Scripts: `scripts/ds24/sync-products.mjs` (create/update),
  `scripts/ds24/request-approval.mjs` (approval at go-live).

## Products: registry + checkout via createBuyUrl

Every offer (subscription plan **and** token package) is **one DS24 product** with a
stable `productId`. Declare products in `config/digistore-products.json` and create them:

```bash
node run.mjs ds24-sync
```

That writes the `productId`(s) back into the config **and** registers the IPN.
(`node scripts/ds24/sync-products.mjs --apply` only does the products — the
purchases would then unlock nothing.)

**The price stays in the registry.** `data[amount]` on the DS24 product is
deprecated and discarded; instead `priceCents`, `currency` and `billingInterval`
travel with every checkout call as `payment_plan[...]`. DS24 does offer a
`createPaymentPlan` API, but a stored plan would put the price in a second place
and could not do free trials, upgrades, vouchers or per-link affiliate
commissions. **No payment plans in the DS24 interface.**

Checkout:

```ts
import { checkoutLinksFor } from "@/lib/digistore/checkout";
import { productsByKind } from "@/lib/digistore/products";

const plans = [...productsByKind("subscription"), ...productsByKind("token")];
const links = await checkoutLinksFor(plans, { buyer: { email } });

const link = links.get("pro");
// { url } → render the buy button
// { url: null, blocker } → "notSynced" | "notConnected" | "error"
```

`checkoutLinksFor` sets two things per token package by itself: the
`tokens:<key>` marker the IPN books the credit against, and
`settings[force_rebilling]=Y` — without which no chargeable `purchase_id` comes
into being and the auto-reload below cannot work. URLs are cached for 20h
(`buy_url_cache`) and regenerate whenever the offer changes. Blueprint:
`app/plans/page.tsx`. All environments use the same live `productId`.

---

## 1. Prepaid tokens: buying more & auto-reload (`createBillingOnDemand`)

`createBillingOnDemand` charges a further payment against an **existing
`purchase_id`** — the customer's payment method is already authorized, **no new
checkout** is needed. That is exactly what carries buying more tokens and the auto-reload.

### Prerequisites

- A **writable API key** and, in the DS24 account, the **"billing on demand"** right.
- A **chargeable `purchase_id`**. It comes into being through:
  - a **subscription** (every subscription `purchase_id` is chargeable), or
  - a purchase made with **`settings[force_rebilling]=Y`** — that keeps the
    payment method on file for later on-demand charges. `checkoutLinksFor` sets
    this for every `kind: "token"` entry (`forceRebilling` in
    `lib/digistore/checkout.ts`).
- **DS24 limits:** 10 charges/day and 1/minute per `purchase_id` (production).

### Flow (important: credit only via IPN)

```
Customer has purchase_id ──▶ createBillingOnDemand(apiKey, {purchaseId, productId,
                                                     priceCents, custom:"m:…;t:…;p:pro"})
      │                         (charges; does NOT credit)
      ▼
DS24 processes payment ──▶ IPN on_payment (custom = "m:…;t:…;p:pro")
      ▼
IPN handler ──▶ creditTokens(...)  (idempotent via order_id → balance +credits)
                 only once the payment is attributed to a member; an
                 anonymous purchase waits for the buyer to sign in
```

The credit **never** happens synchronously in `createBillingOnDemand`, but only
once DS24 confirms the payment via IPN — exactly as with a normal purchase. The
The `custom` value carries the buyer's identity — member id, checkout token
and product key — which connects charge and credit and says WHOSE credit it
is. See `lib/digistore/custom.ts`. The older `tokens:<packageKey>` marker is
still parsed for purchases created before this, but is never sent again.

### First purchase of a package (without on-demand)

The **first** purchase runs through the normal checkout link:

```ts
import { checkoutLinksFor } from "@/lib/digistore/checkout";
import { getProduct } from "@/lib/digistore/products";

const links = await checkoutLinksFor([getProduct("pro")], { buyer: { email } });
const link = links.get("pro");
// -> if link.url, open it for the buyer.
```

The `custom` identity string and `settings[force_rebilling]=Y` are set by
`checkoutLinksFor` itself. The latter is what makes the later auto-reload
possible at all — it is what keeps the payment method on file.

The IPN credits the tokens **and** remembers the `purchase_id` on the token
account (`linkPurchaseId`) — the basis for the later auto-reload.

### Auto-reload

Configure the account and then trigger it when needed:

```ts
import { setAutoReload, consumeTokens, autoReloadIfNeeded } from "@/lib/tokens/account";

// Once (e.g. in the customer dashboard):
await setAutoReload({
  memberId,                           // the signed-in customer
  enabled: true, threshold: 500,      // reload as soon as ≤ 500 tokens
  packageKey: "pro", ds24PurchaseId,  // which package, which purchase_id
});

// On every use:
await consumeTokens({ memberId, amount: 42 });
await autoReloadIfNeeded({ memberId, apiKey });
```

`autoReloadIfNeeded` checks the threshold, takes **a lock atomically**
(`claimReloadSlot` → prevents a double charge on parallel requests) and calls
`createBillingOnDemand`. Credit + lock release happen in the IPN. If the charge
fails, the lock is released immediately. Alternatively iterate **via cron** over
all accounts with a low balance (more robust than the inline call).

### Billing consumption

`consumeTokens` runs in a transaction with a row lock (`FOR UPDATE`) and throws
`InsufficientTokensError` when the balance is not enough — check with
`hasSufficientBalance` beforehand and, if needed, guide the customer to buy more.
Every booking lands in the `tokenLedger` (audit).

---

## 2. Subscription management (cancel · payment details · invoices)

The IPN maintains one row per subscription in `subscriptions` (status, interval and
the management links supplied by DS24). With that you offer in the customer dashboard:

| Function | Implementation |
|----------|----------------|
| **Status/interval** | `subscriptions.status` (`active`/`paused`/`cancelled`) + `billingInterval` (`1_month`/`12_month`). Shown to the customer; it is **not** the access check — see below. | <!-- not-an-access-check: display in the self-service UI -->
| **Cancel** | `stopRebilling(apiKey, ds24PurchaseId)`. Access remains until the end of the period (DS24 sends `last_paid_day`). Alternatively link the customer to `rebillingStopUrl`. |
| **Change payment details** | **No API** — link to the DS24 link `renewUrl` (the customer updates their payment data there). |
| **View invoices** | `invoiceUrl` per payment; history via `listPurchases(apiKey, { email })`. |

If links are missing in the IPN payload, load them with `getPurchase(apiKey, purchaseId)`.

```ts
import { stopRebilling } from "@/lib/digistore/billing";
import { ds24ApiKey } from "@/lib/digistore/settings";
// Cancellation after confirmation by the signed-in customer:
await stopRebilling(ds24ApiKey(), sub.ds24PurchaseId);
// The IPN sets it to 'cancelled' later. (not-an-access-check: display only.)
// The mirror row is not the access answer. The customer KEEPS access until
// DS24 sends last_paid_day — hasPlan() answers true until then.
```

**What the customer may use is a separate question**, and this table does not
answer it. `subscriptions` mirrors what Digistore24 believes about the billing;
`grants` is the app's own record of access, and `hasPlan(memberId, productKey)`
reads it. The gap between them is not academic: between the cancellation and
`last_paid_day` the mirror says "cancelled" and the customer is still entitled
to everything they paid for. See **`entitlements.md`**.

---

## Rules

- **Credit only through the IPN.** Never credit directly in the
  `createBillingOnDemand` call — otherwise a failed payment gets credited wrongly.
- **Idempotency.** Credits are unique over `(accountId, ds24OrderId)`; a
  duplicate IPN does not book again.
- **Lock against double charging.** Always run auto-reload through `claimReloadSlot`.
- **The signature check (SHA512) stays mandatory** — the IPN handler is fail-closed.
- **Writable key & passphrase are secrets** (they live in the `.env` or in the
  host's secret management, read via `lib/digistore/settings.ts`).
- Before changing this billing logic, read the skill **`guardrails`** first.
