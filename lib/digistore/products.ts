// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Central product registry: one offering (subscription plan or token package)
// per key, and **one Digistore24 product per key AND language**. The source of
// truth is the config file `config/digistore-products.json`.
//
// Flow (see docs/digistore-billing-modes.md):
//   1. Declare the products in the JSON — including price and interval.
//   2. `scripts/ds24/sync-products.mjs` creates them via createProduct or
//      updates them via updateProduct and writes the ids back into
//      `productIdByLanguage`.
//   3. Checkout runs through createBuyUrl: price, currency and interval travel
//      WITH the call as a payment_plan (lib/digistore/checkout.ts →
//      lib/digistore/buyUrl.ts). Nothing about the price is maintained a second
//      time inside Digistore24.
//
// All environments (DEV/STAGING/PROD) use THE SAME live products.
//
// ============================================================================
// WHY ONE OFFERING CAN NEED SEVERAL DIGISTORE24 PRODUCTS
//
// **A Digistore24 product carries exactly ONE language, and that language is
// the language of the ORDER FORM.** `data[language]` on createProduct decides
// what the buyer reads on the checkout page — the field labels, the buttons,
// the payment-method names, the terms-and-cancellation text. It is a property
// of the product, and `createBuyUrl` has no language parameter to override it
// with (checked against the API's own `expectedArgs`: `buyer`, `payment_plan`,
// `tracking`, `urls`, `placeholders`, `settings`, `addons` — no language
// anywhere).
//
// So an app whose UI speaks German and English cannot send both audiences to
// one product: one of the two lands on a form in the other's language, right at
// the moment they are asked for their card details. **Two products, one per
// language, is the only way** — hence `productIdByLanguage`, and hence the
// per-language loop in `scripts/ds24/sync-products.mjs`.
//
// What does NOT follow from this: translated product copy. `name`,
// `description`, `tagline` and `features` stay single-language on purpose (it
// is the vendor's own copy — see template/CLAUDE.md → Languages), and the same
// text is sent to every one of the language products.
// ============================================================================
import productsFile from "@/config/digistore-products.json";
import { DEFAULT_LOCALE } from "@/i18n/config";

/**
 * Every kind the registry may declare. The union below is DERIVED from this
 * list so the two cannot drift — and it is exported because two guards
 * enumerate it at runtime: the loader's own check right under `allProducts()`,
 * and `plan-sections.test.ts`, which proves every kind reaches a section on
 * the sales page.
 */
export const PRODUCT_KINDS = ["subscription", "token", "one_time"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export interface ProductDef {
  /** Stable key (e.g. "pro"). */
  key: string;
  /** DS24 product name (also used as name_intern for matching). */
  name: string;
  description?: string;
  kind: ProductKind;
  /** Subscription interval, e.g. "1_month" | "12_month". Sent at checkout. */
  billingInterval?: string;
  /** Token credit per purchase (kind="token" only). */
  credits?: number;
  /**
   * Price in cents — THE authoritative price. Passed along at checkout as
   * payment_plan (lib/digistore/buyUrl.ts); no price is set on the DS24
   * product itself, since `data[amount]` there is deprecated and ignored.
   */
  priceCents?: number;
  currency?: string;
  /** Short addition under the name on the plans page. */
  tagline?: string;
  /** Bullet points on the plans page. */
  features?: string[];
  /** Highlights the plan on the page ("most popular"). */
  highlight?: boolean;
  /** Product image for Digistore24 (publicly reachable URL). */
  imageUrl?: string | null;
  /**
   * **One Digistore24 product per language** — the id, keyed by the language
   * its order form is in. `null` = declared but not created yet;
   * `sync-products.mjs` writes the ids back here.
   *
   *   "productIdByLanguage": { "de": "412345", "en": "412346" }
   *
   * The keys are the languages this offering is SOLD in, and they should cover
   * the app's `LOCALES` (`i18n/config.ts`) — a locale with no entry falls back
   * to another product, and its buyers get a form in the wrong language (see
   * `checkoutProductFor`). `node run.mjs ds24-sync` warns about the gap.
   *
   * The language also decides **which Digistore24 marketplace the approval is
   * requested from**: German → Digistore24 Germany (siteowner 1), everything
   * else → USA (2). So each language product is submitted where it belongs.
   * See `scripts/ds24/request-approval.mjs` and `scripts/ds24/_resellers.mjs`.
   */
  productIdByLanguage?: Record<string, string | null>;
  /**
   * LEGACY, read but never written: the single-product shape from before
   * template 0.6.0, where an offering had one `productId` and `language` said
   * which language it was in.
   *
   * Still understood so a registry written against the old shape keeps
   * selling — it reads as `productIdByLanguage: { [language ?? "de"]: productId }`
   * (see `productIdsOf`). `ds24-sync` rewrites such an entry into the new
   * shape the next time it runs. Do not add these to a new registry.
   */
  productId?: string | null;
  /** LEGACY, see `productId`. The language of that single product. */
  language?: string;
}

/**
 * The DS24 product ids of an offering, by language — only the ones that exist,
 * so an entry declared as `null` (not synced yet) is absent rather than empty.
 *
 * The ONE place the legacy `productId`/`language` shape is understood; every
 * reader goes through here so there is exactly one translation between the two
 * and no call site has to know that the old one existed. The legacy pair only
 * fills a language the map does not already name — a registry mid-migration
 * has both, and the map is the one `ds24-sync` maintains.
 */
export function productIdsOf(def: ProductDef): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [lang, id] of Object.entries(def.productIdByLanguage ?? {})) {
    if (id) ids[lang] = String(id);
  }
  const legacyLang = def.language || DEFAULT_LOCALE;
  if (def.productId && !ids[legacyLang]) ids[legacyLang] = String(def.productId);
  return ids;
}

/** Every language this offering has a live Digistore24 product for. */
export function productLanguages(def: ProductDef): string[] {
  return Object.keys(productIdsOf(def));
}

/**
 * The Digistore24 product to send a buyer reading `locale` to — the one whose
 * ORDER FORM is in their language — or `null` when the offering is not synced
 * at all.
 *
 * **The fallback chain is deliberate, and it prefers a sale in the wrong
 * language over no sale**: exact locale, then the app's default locale, then
 * whichever product exists. An offering sold in German only stays buyable by an
 * English visitor; they simply get the German form. Refusing instead would turn
 * a missing translation into a lost customer, and the gap is already reported
 * where it can be fixed — `node run.mjs ds24-sync` warns when a registry
 * language set does not cover the app's `LOCALES`.
 *
 * Returns the language it actually resolved to, not just the id: the caller
 * needs it for the buy-URL cache key (two languages of one offering are two
 * different checkout URLs — see `lib/digistore/checkout.ts`).
 */
export function checkoutProductFor(
  def: ProductDef,
  locale: string,
): { productId: string; language: string } | null {
  const ids = productIdsOf(def);
  const language =
    (ids[locale] && locale) ||
    (ids[DEFAULT_LOCALE] && DEFAULT_LOCALE) ||
    Object.keys(ids)[0];
  return language ? { productId: ids[language], language } : null;
}

/**
 * Price formatted per the language's conventions: "19,00 €" (de), "€19.00"
 * (en). `null` when no price is set — the UI then writes "on request"
 * (`plans.onRequest`).
 *
 * The currency stays the product's; only the formatting is localized.
 * Converting prices would be wrong — what gets billed is what Digistore24
 * holds.
 */
export function formatPrice(def: ProductDef, locale: string): string | null {
  if (def.priceCents == null) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: def.currency ?? "EUR",
  }).format(def.priceCents / 100);
}

/** Translatable label for the billing interval. */
export type IntervalKey = "perMonth" | "perYear" | "oneTime";

/**
 * The interval as a key into `messages/*.json` (namespace `plans`) — not as
 * finished text, so the plans page can render it in the visitor's language.
 * `null` for an interval we do not know; the UI then shows the raw value.
 */
export function intervalKey(def: ProductDef): IntervalKey | null {
  if (def.kind !== "subscription") return "oneTime";
  if (def.billingInterval === "1_month") return "perMonth";
  if (def.billingInterval === "12_month") return "perYear";
  return null;
}

interface ProductsFile {
  products: Record<string, Omit<ProductDef, "key">>;
}

const raw = productsFile as unknown as ProductsFile;

/** All declared products (with the key resolved). */
export function allProducts(): ProductDef[] {
  return Object.entries(raw.products).map(([key, def]) => ({ key, ...def }));
}

/**
 * The registry entries whose `kind` is not one this app knows — as messages,
 * one per offending entry. Pure and takes the list, so the typo case is
 * asserted by tests rather than trusted (the shipped registry is always
 * clean, which is exactly why a check reading it directly would prove
 * nothing).
 */
export function unknownKindProblems(
  products: ReadonlyArray<{ key: string; kind: unknown }>,
): string[] {
  return products
    .filter((p) => !(PRODUCT_KINDS as readonly unknown[]).includes(p.kind))
    .map(
      (p) =>
        `"${p.key}": unbekannte Produktart ${JSON.stringify(p.kind)} — erlaubt: ${PRODUCT_KINDS.join(", ")}`,
    );
}

// The cast above (`as unknown as ProductsFile`) is a claim, and the registry
// is a JSON file the vendor edits by hand — so the claim is checked here,
// once, when the module loads, and a `"kind": "one-time"` (hyphen typo)
// refuses to start instead of doing what it used to do: silently vanish from
// the sales page while STAYING BUYABLE via a direct POST, where the buyer
// pays and the IPN's strict `kind === "token"` credits nothing.
//
// Loud on purpose, and the opposite trade from `billingMode()`, which falls
// back to `"both"` on a typo: there, one direction is harmless (a card too
// many). Here there is no harmless direction — dropping the product IS the
// damage — so this follows `getProduct()` and `hasPlan()` instead: an
// unchecked value does not mean "not shown", it takes the app down at the
// first `node run.mjs start`, which is the cheapest moment anybody can learn
// about it.
{
  const problems = unknownKindProblems(allProducts());
  if (problems.length > 0) {
    throw new Error(`config/digistore-products.json: ${problems.join("; ")}`);
  }
}

/**
 * Product definition, or `null` for a key the registry does not hold.
 *
 * The forgiving twin of `getProduct()`, for the callers that must survive a key
 * going missing. That is not a theoretical case: the registry is a file the
 * app-builder edits, so a key recorded on an old order can be renamed or
 * deleted afterwards — and `orders.productKey` is deliberately never
 * reconstructed. A purchase confirmation must not throw over that.
 */
export function findProduct(key: string): ProductDef | null {
  // Object.hasOwn, not a bare index: the registry is a plain JSON object,

  // so "constructor", "__proto__", "toString" and "valueOf" all resolve

  // through Object.prototype and would be treated as real products —

  // including by hasPlan(), which would then answer true for them.

  const def = Object.hasOwn(raw.products, key) ? raw.products[key] : undefined;
  return def ? { key, ...def } : null;
}

/** Product definition, or throws on an unknown key. */
export function getProduct(key: string): ProductDef {
  const def = findProduct(key);
  if (!def) throw new Error(`Unbekanntes Produkt: ${key}`);
  return def;
}

/** Products of one kind (e.g. all token packages). */
export function productsByKind(kind: ProductKind): ProductDef[] {
  return allProducts().filter((p) => p.kind === kind);
}

/**
 * WHAT was bought, from the Digistore24 product id on a payload — the reverse
 * lookup, and the ONE safe way to do it.
 *
 * PURE, and takes the product list as an argument, so the guard below is
 * asserted by tests rather than trusted (products.test.ts). It governs which
 * plan a payment unlocks; nothing in this repo can test a DB-bound function.
 *
 * **It searches EVERY language product of an offering.** A German buyer and an
 * English one arrive on two different Digistore24 products, and the IPN names
 * whichever one was actually bought — so matching only the first id would leave
 * every English purchase unattributed, and `orders.productKey` is never
 * reconstructed later.
 *
 * THE GUARD IS BOTH SIDES BEING NON-EMPTY. The ids are null for every offering
 * until `node run.mjs ds24-sync` has run, and an IPN payload may arrive with
 * no product id at all. A naive `p.productId === id` with two empty values
 * matches the FIRST UNSYNCED PRODUCT — which for an entitlement means granting
 * a plan the buyer never bought. `productIdsOf` drops the empty ones, so an
 * unsynced entry simply does not match and the answer is `null` — *unknown*,
 * never *wrong*. That is the distinction the warning on `orders.productKey`
 * (schema-digistore.ts:58-64) was protecting, and it survives intact.
 *
 * Ambiguity resolves to `null` as well: two offerings sharing one Digistore24
 * product id cannot be told apart, and guessing would grant the wrong one. Two
 * LANGUAGES of the SAME offering are not ambiguous — they are one answer.
 */
export function productByDs24Id(
  id: string | null | undefined,
  products: ProductDef[] = allProducts(),
): ProductDef | null {
  if (!id) return null;
  const matches = products.filter((p) =>
    Object.values(productIdsOf(p)).includes(String(id)),
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Live product ID of an offering, for one language. Throws when that offering
 * is not synced at all (run `node run.mjs ds24-sync`).
 *
 * Falls back exactly as `checkoutProductFor` does, so a language nobody has
 * created a product for yet answers with another one rather than throwing —
 * "not synced" and "not sold in this language" are different states, and only
 * the first is an error.
 */
export function productId(key: string, locale: string = DEFAULT_LOCALE): string {
  const resolved = checkoutProductFor(getProduct(key), locale);
  if (!resolved) {
    throw new Error(
      `Produkt "${key}" hat noch keine productId. Erst 'node run.mjs ds24-sync' ausfuehren.`,
    );
  }
  return resolved.productId;
}

/** Does this offering have at least one live Digistore24 product? */
export function hasProductId(key: string): boolean {
  return productLanguages(getProduct(key)).length > 0;
}

// Checkout links are NOT built here. A plain product link
// (`…/product/<id>`) would force the price to be maintained inside
// Digistore24 as a payment plan, and would give up free trials, upgrades,
// vouchers and per-link affiliate commissions. See lib/digistore/checkout.ts.
