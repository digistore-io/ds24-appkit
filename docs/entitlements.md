# Entitlements: what a Member may use

One question, one answer: **`lib/entitlements/manage.ts`**. Everything on this
page is about that file, and about the two functions it exports for your app.

```ts
import { hasPlan, entitlementsFor } from "@/lib/entitlements/manage";
```

Code:

- `lib/entitlements/manage.ts` — the API (`hasPlan`, `entitlementsFor`) and the
  writes behind it.
- `lib/entitlements/rules.ts` — `chooseGrantTransition`: what each Digistore24
  event does to access. Pure, and covered by `rules.test.ts`.
- `db/schema-entitlements.ts` — the `grants` table.
- `app/api/ipn/route.ts` → `lib/digistore/payment-event.ts` — where the events
  arrive and the grants get maintained. You do not call into this yourself.
- `lib/tokens/account.ts` — the token balance, which is a *different* thing; see
  [Tokens are not entitlements](#tokens-are-not-entitlements).

---

## The check: `hasPlan`

```ts
hasPlan(memberId: string, productKey: string): Promise<boolean>
```

One Member, one plan, one boolean. This is what a feature asks.

```ts
if (await hasPlan(memberId, "basis_monatlich")) {
  // the feature
}
```

`productKey` is a key from `config/digistore-products.json` — the same registry
the plans page and the checkout use. **It throws on a key the registry does not
know** (`Error: Unbekanntes Produkt: <key>`), and that is on purpose: a typo
that quietly returned `false` would be a paying customer locked out of a feature
that simply never appears, with no log line saying why. A programming error has
to look like one.

## The list: `entitlementsFor`

```ts
entitlementsFor(memberId: string): Promise<Entitlement[]>

interface Entitlement {
  productKey: string;
  source: "purchase" | "manual";
  accessUntil: Date | null;
}
```

Everything the Member may currently use, in one query. Use it to render a list,
a badge or an account overview:

```ts
const owned = await entitlementsFor(memberId);
const keys = owned.map((e) => e.productKey);   // ["basis_monatlich"]
```

`source` says where it came from: `"purchase"` — somebody paid — or `"manual"`,
an entitlement an operator handed out from `/dashboard/admin/users/<id>`, either
permanently or through a day they picked. A Product Key held both ways appears
**once**, reported as `"purchase"`.

### Your code never learns which it was

And that is the point of the whole design, not an accident of the return type.

```ts
// Answers true for a subscription that billed this morning AND for the comp
// the operator typed in at 11pm to fix a support case. Identically. There is
// no second function and no flag.
if (await hasPlan(memberId, "basis_monatlich")) { /* the feature */ }
```

An operator can settle a purchase that never matched, or hand somebody a month
of goodwill, and the feature works on the customer's next page load — with
nothing in your app to change, nothing to teach and nothing to deploy. A
`hasPlan` written against `orders` would have needed a second code path for
every one of those cases, and each of those paths would have been the one nobody
tested.

So `source` is there for a **person** to read — the operator's own page shows it
so support can explain a row months later. It is not a branch to write. Treat
`"manual"` as second class in a feature check and every comp your operator hands
out becomes a bug report; write `source === "purchase"` into a gate and you have
rebuilt the mistake this page exists to prevent.

### `accessUntil`, and the two things `null` means

`accessUntil` is the instant access runs out — and `null`, the normal case,
means something different depending on `source`:

- **`source: "purchase"` → always `null`.** Purchased access ends by *event*
  (`last_paid_day`), never by a stored day. There is no end date to show, and
  there is no other column that is one: `subscriptions.nextPaymentAt` says when
  money moves next, keeps naming a day after a cancellation, and reading it here
  is exactly what this whole page tells you not to do.
- **`source: "manual"` → `null` when the operator granted it permanently.**
  Otherwise it holds the last millisecond of the day they picked.

Rendering it takes one extra option, and it is not optional:

```tsx
const format = await getFormatter();     // next-intl, never toLocaleDateString

row.accessUntil
  ? format.dateTime(row.accessUntil, { dateStyle: "long", timeZone: "UTC" })
  : t("noEndDate")                       // a real sentence, never a blank cell
```

**`timeZone: "UTC"` is load-bearing.** The value is stored in UTC as the last
millisecond of the chosen day, so without the pin every viewer ahead of UTC
reads the *following* day — and on 31 December, the following year. A blank cell
for `null` is the other half: the customer cannot tell "runs forever" from "we
forgot to say".

The account page the template ships — `app/dashboard/account/page.tsx` — does
both, and is the shortest thing to copy from.

Note the asymmetry with `hasPlan`: `entitlementsFor` returns what is stored and
never consults the registry, so a Product Key you removed from
`config/digistore-products.json` still turns up here — while `hasPlan` on that
same key throws. Removing a key that customers hold is a migration, not an edit.

---

## Gating a page: the whole thing

```tsx
// app/dashboard/reports/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { hasPlan } from "@/lib/entitlements/manage";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Not entitled? Send them where they can become entitled.
  if (!(await hasPlan(session.user.id, "basis_monatlich"))) {
    redirect("/plans");
  }

  return <p>The paid feature.</p>;
}
```

Three things this small example is doing deliberately:

1. **The check is on the server, in the page.** A Server Action or a route
   handler is an HTTP endpoint of its own — it is not protected by the page that
   renders its button. Every action behind a paid feature repeats the check.
2. **It is derived per request**, never cached as a boolean on the user row or
   in the session. A stored "yes" survives the chargeback that should have
   revoked it. The check is one indexed query; you do not need to save it.
3. **`redirect("/plans")`, not a 404.** The customer who is not entitled is
   usually a customer who would like to be.

---

## Where the answer comes from

`hasPlan` and `entitlementsFor` read **`grants`** — the app's own record of who
may use what. They do not read `orders` and they do not read `subscriptions`,
and that is the single most important thing on this page:

| Table | What it is | Answers "may they use this"? |
|---|---|---|
| `grants` | the app's own access record | **yes — this is the source** |
| `orders` | the financial record: what was paid, and what became of the money | no <!-- not-an-access-check: describing what the table is for --> |
| `subscriptions` | a mirror of what Digistore24 believes about the rebilling | no <!-- not-an-access-check: describing what the table is for --> |

Two answers to "may this person use this" drift apart; one does not. And the
billing tables do not merely fail to answer — they answer *wrongly*, because
they carry values that mean the opposite of the access decision. The worked
example is a cancellation, below.

### The events decide, and nothing else

The IPN maintains `grants`, and it does so from the **raw event name**:

| Event | Effect on access |
|---|---|
| `on_payment`, `on_payment_subscription_signup` | grants it — and lifts a suspension, if there is one |
| `on_refund` | ends it, for good |
| `on_chargeback` | ends it, for good |
| `on_payment_missed` | **suspends** it — reversible |
| `last_paid_day` | ends it. This is how purchased access normally expires |
| `on_rebill_cancelled` | **nothing at all** |
| `on_rebill_resumed` | **lifts a suspension** — and only that. Support restarted the billing; no money moved, so it never creates a grant |
| anything else | nothing |

Ended is ended: no later event reopens a grant that a refund, a chargeback or
the last paid day closed. A redelivered payment event cannot hand access back to
a refunded customer, and an operator restarting the rebilling months after
expiry lifts nothing.

Do **not** try to reproduce this from a mapped status. The mapping collapses
`on_rebill_cancelled` and `last_paid_day` into the same value, and those two
mean opposite things about access — which is precisely why
`chooseGrantTransition` takes the raw event name and has no status parameter at
all.

---

## The three surprises

### 1. A cancelled subscription still has access

This is the one that catches everybody.

Digistore24 sends **two** events for a cancellation, days or months apart:

- `on_rebill_cancelled` — immediately, when the buyer or support stops the
  rebilling. Billing stops. **Access does not.**
- `last_paid_day` — when the period that was actually paid for is over. *Now*
  access ends.

Somebody who cancels a yearly plan in month one keeps everything for eleven more
months. They paid for it. An app that blocks them on the cancellation has taken
money and withheld the goods, and the support ticket is a refund request.

`hasPlan` gets this right on its own. You only get it wrong by going around it —
by reading the billing state and treating "cancelled" as "blocked".

### 2. A missed payment reads as no entitlement — but is not the end

`on_payment_missed` **suspends** the grant. `hasPlan` answers `false` and
`entitlementsFor` leaves the key out entirely, exactly as if the entitlement were
gone.

It is not gone. The row is still there, the suspension is reversible, and the
next successful payment (or an operator restarting the rebilling) lifts it and
the entitlement comes straight back. So:

- **Do not delete the customer's data** when the entitlement disappears. A card
  that expires over a weekend is the ordinary case, not an account closure.
- Prefer wording like "your access is paused" over "your account was deleted".

You cannot tell the two apart from `hasPlan` alone — so there is a second reader
for the *message*, and only for the message:

```ts
import { entitlementsFor, suspendedKeysFor } from "@/lib/entitlements/manage";
import { pausedKeys } from "@/lib/entitlements/rules";

const owned  = await entitlementsFor(memberId);
const paused = pausedKeys(owned, await suspendedKeysFor(memberId));
// paused = ["basis_monatlich"] → "your access to Basis is paused"
```

`suspendedKeysFor` returns Product Keys and nothing else — no note, no operator
— and `pausedKeys` subtracts what the Member can still use another way, because
one key held through a failed subscription *and* an operator's comp is not
paused at all. Neither of them decides anything: `hasPlan` stays the check, and
a key in `paused` is a key the Member may **not** use right now.

Without this the card-expiry customer gets an empty list and no explanation,
which is the failure this whole section is about.

### 3. A Member can hold two plans at once — or briefly none

A Digistore24 plan switch is not one event. The old rebilling stops and a new
purchase starts, and the two arrive **days apart, in either order**. So an
upgrading customer holds:

- **both** keys for a while — the old one has not expired, the new one is live;
- or, if the old plan expired first, **neither**, until the new payment lands.

The per-key dedupe merges duplicate grants for the *same* Product Key. It does
not merge different keys, and it must not: they are different entitlements.

So there is no such thing as "the Member's plan":

```ts
// WRONG — shows the wrong plan to every upgrading customer, and crashes for
// the one who is briefly between plans.
const plan = (await entitlementsFor(memberId))[0].productKey;

// RIGHT — ask per feature.
const canExport = await hasPlan(memberId, "basis_jaehrlich");
```

If you want to *display* something like a current plan, pick it deliberately —
highest tier wins, say — and handle the empty case. Do not let an array index
make that decision for you.

---

## Tokens are not entitlements

Prepaid tokens are a **balance**, not access, and they live in
`lib/tokens/account.ts`. A purchase of a token package never creates a grant, so
`hasPlan(memberId, "pro")` is `false` for every Member, forever — `pro` ships as
a `kind: "token"` package in the registry. Only `kind: "subscription"` and
`kind: "one_time"` entries become entitlements.

```ts
import {
  getTokenAccount,
  hasSufficientBalance,
  consumeTokens,
  InsufficientTokensError,
} from "@/lib/tokens/account";

// Read the balance (undefined = the Member has no account yet).
const account = await getTokenAccount(memberId);
const balance = account?.balance ?? 0;

// Pure check, no database — use it to disable a button or price a job.
if (!hasSufficientBalance(balance, 42)) {
  // offer them a top-up
}

// Spend. Transactional, with a row lock: safe under concurrent requests.
try {
  const left = await consumeTokens({ memberId, amount: 42, note: "report" });
  // `left` is the new balance
} catch (err) {
  if (err instanceof InsufficientTokensError) {
    // err.balance, err.requested
  }
  throw err;
}
```

`consumeTokens` throws `InsufficientTokensError` rather than returning `false`,
and it throws on `amount <= 0` too. Every booking lands in the ledger, so a
balance is always explainable.

The two models combine well and are meant to: a subscription gates *whether*
the feature exists for this customer, the balance limits *how much* they use it.

```ts
if (!(await hasPlan(memberId, "basis_monatlich"))) return notEntitled();
await consumeTokens({ memberId, amount: cost });
```

Buying packages, auto top-up and the subscription self-service:
`digistore-billing-modes.md`.

---

## Rules

- **Never answer an access question from a billing table.** `hasPlan` /
  `entitlementsFor`, always. A hand-written query beside them is a second answer
  that will drift from the first.
- **Never store the answer** as a boolean on the user, in the session or in a
  cache. Derive it per request.
- **Never gate on a mapped status.** The events decide; the mapping loses the
  distinction that matters.
- **Repeat the check in Server Actions and route handlers.** The page rendering
  the button protects nothing.
- **Ask per feature, not "which plan".** Two plans at once is a legal state.
- Before you change the entitlement logic itself, read the skill **`guardrails`**
  — this is a money path.
