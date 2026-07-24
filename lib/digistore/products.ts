// Central product registry: ONE Digistore24 product per offering (subscription
// plan or token package). The source of truth is the config file
// `config/digistore-products.json`.
//
// Flow (see docs/digistore-billing-modes.md):
//   1. Declare the products in the JSON — including price and interval.
//   2. `scripts/ds24/sync-products.mjs` creates them via createProduct or
//      updates them via updateProduct and writes the `productId` back.
//   3. Checkout runs through createBuyUrl: price, currency and interval travel
//      WITH the call as a payment_plan (lib/digistore/checkout.ts →
//      lib/digistore/buyUrl.ts). Nothing about the price is maintained a second
//      time inside Digistore24.
//
// All environments (DEV/STAGING/PROD) use THE SAME live products — there is
// exactly one `productId` per offering.
import productsFile from "@/config/digistore-products.json";

export type ProductKind = "subscription" | "token" | "one_time";

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
  /** Live product ID set by sync-products.mjs (null = not created yet). */
  productId?: string | null;
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

/** Product definition, or throws on an unknown key. */
export function getProduct(key: string): ProductDef {
  // Object.hasOwn, not a bare index: the registry is a plain JSON object,

  // so "constructor", "__proto__", "toString" and "valueOf" all resolve

  // through Object.prototype and would be treated as real products —

  // including by hasPlan(), which would then answer true for them.

  const def = Object.hasOwn(raw.products, key) ? raw.products[key] : undefined;
  if (!def) throw new Error(`Unbekanntes Produkt: ${key}`);
  return { key, ...def };
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
 * THE GUARD IS BOTH SIDES BEING NON-EMPTY. `productId` is null for every
 * offering until `node run.mjs ds24-sync` has run, and an IPN payload may arrive with
 * no product id at all. A naive `p.productId === id` with two empty values
 * matches the FIRST UNSYNCED PRODUCT — which for an entitlement means granting
 * a plan the buyer never bought. With the guard an unsynced entry simply does
 * not match and the answer is `null` — *unknown*, never *wrong*. That is the
 * distinction the warning on `orders.productKey` (schema-digistore.ts:58-64)
 * was protecting, and it survives intact.
 *
 * Ambiguity resolves to `null` as well: two offerings sharing one Digistore24
 * product id cannot be told apart, and guessing would grant the wrong one.
 */
export function productByDs24Id(
  id: string | null | undefined,
  products: ProductDef[] = allProducts(),
): ProductDef | null {
  if (!id) return null;
  const matches = products.filter((p) => p.productId && p.productId === id);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Live product ID of an offering. Throws when not synced yet (run
 * scripts/ds24/sync-products.mjs).
 */
export function productId(key: string): string {
  const id = getProduct(key).productId;
  if (!id) {
    throw new Error(
      `Produkt "${key}" hat noch keine productId. Erst 'node scripts/ds24/sync-products.mjs --apply' ausfuehren.`,
    );
  }
  return id;
}

export function hasProductId(key: string): boolean {
  return Boolean(getProduct(key).productId);
}

// Checkout links are NOT built here. A plain product link
// (`…/product/<id>`) would force the price to be maintained inside
// Digistore24 as a payment plan, and would give up free trials, upgrades,
// vouchers and per-link affiliate commissions. See lib/digistore/checkout.ts.
