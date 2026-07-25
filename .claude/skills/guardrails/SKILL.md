---
name: guardrails
description: Security and due-diligence rules for this Digistore SAAS. Read this before you change anything around money/billing, secrets/API keys, personal customer data (GDPR) or external systems. Names the stop criteria at which you should involve a human.
---

# Guardrails — before something goes wrong

This app processes **real money** and **real customer data**. Stick to the
following rules. They are the "golden path" — do not rip them out.

## Money & billing

- The **IPN signature verification (SHA512)** in `lib/digistore/ipn.ts` is mandatory.
  Never switch it off, loosen it or bypass it.
- Set the order status exclusively through IPN events (`mapEventToStatus`). It is
  the **financial record** — what somebody paid, and what became of that money.
  It is not the access rule; see **Access** below for that.
- **No mock/demo fallback** on API errors. Make errors visible, do not
  hide them.
- Preserve idempotency: purchases are unique via `ds24OrderId` — never book them
  twice. Digistore24 **retries an IPN until it receives `OK` with HTTP 200**, so
  a transient failure must fail loudly (throw → 500 → redelivery). Only a
  permanent one may be acknowledged with `OK`.

## Attribution — whose payment is this?

- A token credit requires an **attributed `memberId`**. Never credit on the
  buyer email alone. An unattributed purchase is recorded and waits — it is
  credited when the buyer signs in, or when you attach it under
  `/dashboard/admin/purchases`.
- The buyer email is **not verified by Digistore24** — anyone can type anyone's
  address into a checkout. It is a fallback that must stay safe when the claim
  is a lie. The identity in `tracking[custom]` is the authenticated path.
- Attribution only ever **grants**, never revokes. Never clear
  `orders.memberId`; fill it only when it is null.
- Never weaken `parseCustom` to accept a member id without its checkout token.
  Half an identity is not a weaker identity — it is none.
- **Ask the entitlement API what a Member may use** —
  `hasPlan(memberId, productKey)`. It takes the signed-in Member as its first
  argument, so the scoping that a hand-written query keeps forgetting is built
  in. See **Access** below.

## Access — who may use what

`lib/entitlements/manage.ts` answers this, and it is the only thing that does:

```ts
import { hasPlan, entitlementsFor } from "@/lib/entitlements/manage";

// The key is a plan from config/digistore-products.json — a token package is a
// balance, not an entitlement, and always answers false.
if (await hasPlan(memberId, "basis_monatlich")) { /* the feature */ }
const owned = await entitlementsFor(memberId); // [{ productKey, source, accessUntil }]
```

- **Never answer an access question from a billing table.** `orders` records
  money, `subscriptions` mirrors what Digistore24 believes; neither says what a
  Member may use. Both carry values that mean the opposite of the access
  decision — a cancelled subscription reads `cancelled` while the customer still
  legitimately has access to the end of the period they paid for. Reading it as
  "blocked" takes away time somebody has paid for; that is a refund case.
- **Access is decided by the IPN events, and by nothing else.** `on_payment`
  grants it, `on_refund` and `on_chargeback` end it for good, `on_payment_missed`
  suspends it reversibly, `last_paid_day` ends it — and `on_rebill_cancelled`
  changes nothing at all. Do not derive the decision from a mapped status
  instead: the mapping collapses `on_rebill_cancelled` and `last_paid_day` into
  the same value, and those two mean opposite things.
- **Never cache the answer as a boolean** on the user or in a session. A stored
  yes survives the chargeback that should have revoked it. Derive it per request;
  it is one indexed query.
- **A Member may hold two plans at once** during a Digistore24 plan switch (the
  old rebilling stops and the new purchase starts days apart, in either order).
  Ask `hasPlan` per feature — never `entitlements[0]`.

Full reference, failure modes and examples: `docs/entitlements.md`.

## By hand — what the Operator can do without a payment

`/dashboard/admin/users/<id>` lets an Operator move a customer's token balance
and hand out a plan nobody paid for. No card is charged, so it reads like an
edit — it is not. Both are money paths, both are `requireOwner()` on every
Server Action, and both refuse without a written reason.

- **A balance correction is a booking, never an edit.** `adjustTokens()`
  (`lib/tokens/account.ts`) writes a signed row into `token_ledger` inside a
  transaction that locks the account first, and the reason is stored with it.
  Never write `token_accounts.balance` directly and never "clean up" the
  journal: a balance without its bookings is a number nobody can explain, and
  the journal is what a disputed charge gets settled from. Two Operators
  correcting at once without that lock lose one correction *and* record a
  balance that was never true.
- **A manual grant is access somebody did not pay for.** `grantByHand()`
  (`lib/entitlements/manage.ts`) records who issued it, why, and until when —
  permanently, or through a chosen day. It refuses a token package outright: a
  balance is not an entitlement, so such a row would give nobody anything and
  no one could explain it afterwards.
- **A revocation cannot be undone.** `revokeGrantByHand()` closes the grant by
  stamping `ended_at`, and that column is terminal — no later payment, no
  second click, nothing clears it. The only repair for a revocation made in
  error is issuing a *new* manual grant, which is exactly why two identical
  manual grants are deliberately allowed. Do not build an "un-revoke".
- **What an Operator may never end by hand is a purchased entitlement.**
  `canRevokeGrant()` refuses anything whose source is a purchase, and the
  `UPDATE` repeats the condition rather than trusting a hidden menu entry.
  Purchased access ends by Digistore24 event (refund, chargeback, last paid
  day) and by nothing else; ended by hand instead, the refund the customer is
  owed has nothing left to close.
- **A reason that is blank does not count.** Both paths reject an empty note
  *and* one that only looks written — a zero-width space survives `trim()`, and
  a control character is accepted by JS and rejected by Postgres, which the
  Operator then reads as "unknown error". That note is the sole record of why
  money or access moved.

## Secrets & API keys

- **Never** put API keys, passphrases or tokens into the code, the repo or logs.
- Configure via the `.env` (add new variables to `.env.example`) or the host's
  secret management. The operator's Digistore24 credentials
  (`DIGISTORE_API_KEY`, `DIGISTORE_IPN_PASSPHRASE`) are fetched into the `.env`
  by `node run.mjs ds24-connect`; they are read via `lib/digistore/settings.ts`. Do not
  build a UI for entering keys.

## Customer data & GDPR

- Only collect what is needed. Record the consent via the opt-in page
  (`orders.gdprConsentAt`), mind the `is_gdpr_country` flag.
- Do not pass buyer data on to third parties/external services without a clear
  purpose and consent.

## Signing in as a user

An operator can sign in as one of their customers from
`/dashboard/admin/users` — see **Users & roles** in `CLAUDE.md`. It is a
deliberate hole in this app's own access control, and four properties are what
keep it from being a back door. Do not remove any of them:

- **Narrow.** Only an owner, only onto a member. `canImpersonate()`
  (`lib/users/rules.ts`) refuses another owner outright — every guard in this
  app answers from `session.user.role`, so impersonating an owner would hand
  over every right that owner holds, including this feature. The refusal is in
  the rule, not in the menu: a request that never passed through the menu has to
  be refused identically.
- **Visible.** A banner on every page, in the root layout, that cannot be
  dismissed. If you make it conditional on a route, you have re-opened the gap
  it exists to close.
- **Bounded.** Thirty minutes, then it ends by itself.
- **Recorded.** One row in `impersonations`, written **before** the session
  changes.

**That ordering is the authorisation, not a log line.** `/api/auth/session`
accepts a POST from any signed-in user, and the body reaches the `jwt` callback.
The callback trusts nothing in it — it looks up the record row and rewrites the
session only if that row already names the caller as its operator. Write the row
after the swap, or believe a member id out of the payload, and any customer can
become any other, including you. `lib/impersonation/session.ts` says so at
length; `lib/impersonation/guard.test.ts` fails the build if either changes.

**The exit action is deliberately not `requireOwner()`.** While an impersonation
runs the session's role IS the member's, so an owner check on the way out would
lock the operator inside. It looks like an oversight and is not.

**Money stops at the customer's card.** An impersonated session may spend the
customer's token balance — that is what makes support useful — but automatic
top-up is suppressed (`lib/tokens/spend.ts`), because `createBillingOnDemand`
charges a stored payment method with nobody present to agree to it.

**Never build**: impersonation of an owner, a way to reach it other than the
user list, a chain (impersonating from inside an impersonation), a longer cap
without saying so in `docs/data-protection.md`, or an activity log of what was
done while inside — that last one is a surveillance log of a customer's own
data, and the changes that matter are already recorded elsewhere.

## Auth

- Auth protection is **opt-in, not opt-out**. `proxy.ts` guards only what
  its `matcher` lists (today `/dashboard/:path*`); `auth.config.ts` returns
  true for everything else. **A new page holding customer data is world-
  readable until you add it to the matcher.** Public by design: home, `/login`,
  `/plans`, `/optin/*`, `/account/confirm-email` and the IPN endpoint.
  The confirmation route is authenticated by its single-use token, not by a
  session — the mail is read wherever the inbox is. Do not "fix" it into the
  matcher.

## STOP — involve a human here

Do **not** carry on alone, ask instead, when you are about to:

- fundamentally change the billing/payout logic or the price calculation,
- adjust or deactivate the signature/auth checks — **including anything in
  `lib/impersonation/`**, which rewrites the subject of a signed-in session,
- export, delete or send personal data to external systems,
- connect a new external integration with access to payments or customer data,
- run database migrations that change existing order/user data,
- correct a token balance or hand out a plan for somebody you cannot account
  for — that is real money either way,
- take access away by hand. It cannot be undone, and it is the one Operator
  action with no way back.
