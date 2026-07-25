# Checkout links with `createBuyUrl`

The app creates checkout URLs at runtime via the Digistore24 function
`createBuyUrl` and sends a **complete custom payment plan** along with it —
so price, currency and interval are decided by the app, not by the Digistore product.
**One** base product in Digistore24 per offer is enough.

Implementation: `lib/digistore/buyUrl.ts`.

## Usage

```ts
import { getOrCreateBuyUrl } from "@/lib/digistore/buyUrl";
import { ds24ApiKey } from "@/lib/digistore/settings";

const url = await getOrCreateBuyUrl({
  apiKey: ds24ApiKey(),                // writable key needed (from the .env)
  offer: {
    key: "gold",                       // stable offer key
    productId: "123456",               // DS24 base product
    priceCents: 900,                   // 9.00 EUR
    currency: "EUR",
    billingInterval: "1_month",        // omit = one-off payment
    title: "Paid Challenge - Gold",    // placeholder {TARIF} on the checkout page
    description: "Gold plan (monthly)",
  },
  thankyouUrl: `${appUrl}/optin/[ORDER_ID]`, // DS24 replaces [ORDER_ID]/[BUYER_EMAIL]
});
// -> open url for the buyer (link/redirect)
```

## Caching (important)

- URLs are cached per `offer.key` in the table `buy_url_cache`,
  **TTL 20h** (safety margin below the 24h validity of the DS24 URL).
- **If the offer changes** (price, interval, title, thank-you URL …), the
  `offerHash` changes → a **new URL** is created automatically.
- **User-specific URLs are never cached**: as soon as `buyer`, `affiliate`,
  `campaignKey`, `trackingKey` or `upgradeOrderId` is set, a fresh one is
  created every time — and likewise when `customTracking` carries a buyer
  identity (`m:<memberId>;t:<token>;…`), which names one particular member.
- `customTracking` is judged by its **content**, not by whether it is set. A
  token package sets it on every offering (`tokens:<key>`), and those URLs
  stay shared — otherwise every token card would trigger a live Digistore24
  call on each page view. See `lib/digistore/custom.ts`.

## Rules (from the reference implementation)

- Bracket notation for nested parameters (`payment_plan[first_amount]`).
- Price as a euro string with a dot (`"9.00"`), not in cents, not with a comma.
- `number_of_installments = 0` means an **unlimited subscription** (not "no payment").
- The thank-you URL must be **HTTPS**, otherwise Digistore rejects it.
- API base from `lib/digistore/config.mjs` (`https://www.digistore24.com`) —
  the same for every installation, so not a `.env` value.
- On an invalid affiliate code it is retried once **without** the affiliate.
