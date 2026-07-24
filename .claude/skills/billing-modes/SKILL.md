---
name: billing-modes
description: Sets up the billing models beyond the one-off purchase — fixed subscriptions (monthly/yearly), usage-based prepaid tokens with auto top-up (createBillingOnDemand) as well as subscription self-service for customers (cancel, change payment details, view invoices). Use this after setup-digistore, when the app is meant to bill recurring or by usage (e.g. tokens for AI usage).
---

# Billing models: subscriptions & prepaid tokens

Prerequisite: **`setup-digistore` is done** (API key, IPN, checkout are in
place). This skill builds on that. The code is ready to use in
`lib/digistore/billing.ts`, `lib/tokens/` and `db/schema-tokens.ts` — your job
is to guide the vendor through selection and configuration, **not** to rewrite
the billing.

Full reference with code examples: **`docs/digistore-billing-modes.md`**.

## Step 1 — Choose a billing model

Ask the vendor how billing should work (multiple choices possible):

| Model | When | What it needs |
|--------|------|----------------|
| **Fixed subscription** (monthly/yearly) | plannable access, membership | subscription plan(s) + subscription management |
| **Prepaid tokens** (usage) | AI usage, API calls, "pay per use" | token packages + consumption logic + auto top-up |
| **Both combined** | base subscription + usage on top | both building blocks |

A very common cut for AI apps: **a small base subscription + tokens by usage**.

## Step 2 — Create products (registry)

Every offering (subscription plan **and** token package) is **one Digistore24
product**. Declare them in **`config/digistore-products.json`** (`kind`, name,
description, `priceCents`, for subscriptions `billingInterval`, for tokens
`credits`). Then create them — **you run this yourself**, do not ask the user to
type it:

```bash
node run.mjs ds24-sync
```

That writes the `productId`(s) back into the config and registers the IPN. Use
the `make` target, **not** `node scripts/ds24/sync-products.mjs` directly — the
script alone skips the IPN hookup, and purchases then never unlock anything.

**No payment plans in the DS24 interface.** Price, currency and interval come
from the registry and travel with the checkout call as `payment_plan[...]`. All
environments use the same live products (see `docs/environments.md`).

Checkout for a signed-in Member runs through **`checkoutLinkFor`** from a
server action, carrying `buildIdentity({ memberId, checkoutToken, productKey,
kind })` in `tracking[custom]`; blueprint: `app/plans/actions.ts`. For anonymous
visitors it is **`checkoutLinksFor`** (the shared, cached links). Never a plain
product link.

## Step 3 — Fixed subscription (if chosen)

Plan as a product with `kind: "subscription"` + `billingInterval` (`"1_month"` /
`"12_month"`) and `priceCents`. Both travel with the checkout call, so nothing
is maintained inside DS24. The IPN maintains status and management links in the
table **`subscriptions`**.

Build the **subscription self-service** into the customer dashboard:
- Show the billing state: `subscriptions.status` + `billingInterval`. <!-- not-an-access-check: displayed to the customer -->
  Information for the customer, **never** the access check — that one is
  `hasPlan(memberId, productKey)`, see `docs/entitlements.md`.
- **Cancel** → `stopRebilling(apiKey, ds24PurchaseId)` (after confirmation by
  the signed-in customer). Access stays until the end of the period — the
  entitlement ends on `last_paid_day`, not on the cancellation.
- **Change payment details** → link to the DS24 `renewUrl` (no API of your own).
- **Invoices** → `invoiceUrl` per payment; history via `listPurchases`.

## Step 4 — Prepaid tokens (if chosen)

1. **Packages** are products with `kind: "token"` in the registry (`credits`,
   `priceCents`) — created via `node run.mjs ds24-sync` (step 2).
2. **Purchase**: the identity string carries the product key, so the IPN knows
   which package to book (`p:<productKey>`). `tokens:<key>` remains only for
   anonymous checkouts and for purchases made before this shipped. Either way
   `forceRebilling` (`settings[force_rebilling]=Y`) is set automatically.
   **`forceRebilling` is not optional:** it stores the payment details and thus
   creates the chargeable `purchase_id`. Without it, step 5's auto top-up has
   nothing to charge against and silently cannot work.
3. **Crediting**: happens automatically in the IPN (`creditTokens`, idempotent)
   — don't credit anything synchronously. It requires an attributed payment:
   a purchase made without signing in is credited when the buyer first signs
   in, not at payment time.
4. **Consumption**: `consumeTokens({ memberId, amount })` on every use (transactional, throws
   `InsufficientTokensError` when the balance is too low). Beforehand
   `hasSufficientBalance`.
5. **Auto top-up**: `setAutoReload({ memberId, enabled, threshold, packageKey,
   ds24PurchaseId })`, then `autoReloadIfNeeded(...)` after consumption **or**
   via cron across all accounts with a low balance. Uses `createBillingOnDemand`
   against the stored `purchase_id`; a lock protects against double charging.

### How the on-demand charge works

`createBillingOnDemand` charges against an **existing `purchase_id`** (no new
checkout). Prerequisites: a writable key + the DS24 permission "billing on
demand" + a chargeable purchase_id — a subscription, or a purchase that was
bought with `settings[force_rebilling]=Y` (see step 4.2). DS24 limit: 10
charges/day, 1/minute per purchase_id.

## Step 5 — Tests & database

- Apply the schema: `node run.mjs db-migrate` (the migration for
  `subscriptions`/`token_accounts`/`token_ledger` is already in `drizzle/`).
  Pour your own schema changes into a migration with `node run.mjs db-generate` first.
- **Write tests** for your billing rules (models: `lib/tokens/tokens.test.ts`,
  `lib/digistore/billing.test.ts`). `npm run typecheck && npm run test` must be
  green.

## Next step

Once the billing is in place, before the launch in this order:
**`security-gateway`** → **`performance-gateway`** → **`compliance-check`** →
**`go-live`** → **`go-to-market`**.

## Important rules

- **Crediting exclusively through the IPN.** A `createBillingOnDemand` call
  **never** credits directly — otherwise balance would wrongly be booked when a
  payment fails.
- **Idempotency & lock are mandatory.** Credits are unique via `(accountId,
  ds24OrderId)`; auto top-up only runs through `claimReloadSlot`.
- **Never switch off the signature verification (SHA512)** — the IPN handler is
  fail-closed.
- **No mock/demo fallback** on DS24 API errors — throw errors.
- **For changes to the billing logic, read `guardrails` first** (STOP
  criterion).
