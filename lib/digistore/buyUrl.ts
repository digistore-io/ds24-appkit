// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Building checkout URLs through Digistore24 `createBuyUrl` with a custom
// payment plan and caching. Reference: docs/digistore-createbuyurl.md.
//
// Core idea: price, currency and interval are sent at runtime as a complete
// payment_plan[...] — not maintained inside Digistore. The result is a
// short-lived (24h) signed checkout URL. It is cached per offering; if the
// offering changes, a new URL is created.
//
// ============================================================================
// WHAT THIS FILE RETURNS IS NOT FINISHED — read this before building your own
// checkout on it.
//
// Every URL from here is UNDECORATED. In DEV a checkout link additionally
// carries the Digistore24 test-payment parameter, which is what lets a
// developer buy through the real checkout by clicking "buy" — no cookie, and it
// works on a product the marketplace has not approved yet. That parameter is
// appended by withTestpayParam() (lib/digistore/testpay.ts), and this file
// deliberately does not call it.
//
// The normal route needs nothing from you: checkoutLinkFor() and
// checkoutLinksFor() (lib/digistore/checkout.ts) wrap this layer and already
// decorate. Reach for a registry product and you are done. If you genuinely
// build your own path on createBuyUrl/getOrCreateBuyUrl, the LAST step is
// yours:
//
//   const url = await getOrCreateBuyUrl({ … });
//   return await withTestpayParam(url);   // no-op outside DEV, never throws
//
// Two rules on it, and both are load-bearing:
//
//   1. DEV AND LOCALHOST ONLY — never anywhere a customer can reach. The
//      parameter takes TEST payments: whoever opens such a link gets the
//      product without paying, and the IPN grants real entitlements. The gate
//      is isTestpayActive(), an allowlist of independent conditions, and
//      withTestpayParam() re-checks it itself. Never re-implement that gate at
//      a call site, never loosen it, and never append the raw parameter by
//      hand — the key is account-level and works on live checkout URLs too.
//   2. AFTER the cache, never before. getOrCreateBuyUrl writes its result into
//      buy_url_cache, which is keyed per offering with no member dimension — a
//      decorated URL written there is served to every later visitor. That is
//      why the decoration sits in checkout.ts and not in this file, and
//      checkout.test.ts fails the build if it moves here.
// ============================================================================
import crypto from "crypto";
import { ds24Post } from "./client";
import { identifiesMember } from "./custom";
import { db } from "@/db";
import { buyUrlCache } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface Offer {
  /** Stable key of the offering (e.g. "gold"). The cache key. */
  key: string;
  /** Digistore product ID of the underlying base product. */
  productId: string;
  /** Price in cents. */
  priceCents: number;
  /** Currency, default "EUR". */
  currency?: string;
  /** e.g. "1_month" | "12_month". Omit for a one-off payment. */
  billingInterval?: string;
  /** 0 = subscription (open-ended), 1 = one-off. Default: 0 when an interval is set, else 1. */
  numberOfInstallments?: number;
  /** Display title on the checkout page (sent as `placeholders[TITLE]`). */
  title?: string;
  /** Display description (placeholder {DESCRIPTION}). */
  description?: string;
  /** Lifetime of the buy URL, default "24h". */
  validUntil?: string;
  /**
   * settings[force_rebilling]=Y — forces stored payment details, even for
   * one-off purchases. A prerequisite for later charging against this purchase
   * via createBillingOnDemand (token repurchase / auto top-up). For real
   * subscriptions (billingInterval) it is not needed, but does no harm.
   */
  forceRebilling?: boolean;
}

export interface BuyerContext {
  buyer?: { email: string; firstName?: string; lastName?: string };
  affiliate?: string;
  campaignKey?: string;
  trackingKey?: string;
  upgradeOrderId?: string;
  upgradeType?: "upgrade" | "downgrade";
  /** Free-form context that arrives in the IPN under tracking[custom]. */
  customTracking?: string;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Builds the x-www-form-urlencoded body for createBuyUrl (pure, testable). */
export function buildBuyUrlBody(
  offer: Offer,
  ctx: BuyerContext = {},
  thankyouUrl?: string,
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("product_id", offer.productId);
  body.set("valid_until", offer.validUntil ?? "24h");

  const price = euros(offer.priceCents);
  body.set("payment_plan[first_amount]", price);
  body.set("payment_plan[other_amounts]", price);
  body.set("payment_plan[currency]", offer.currency ?? "EUR");
  const installments =
    offer.numberOfInstallments ?? (offer.billingInterval ? 0 : 1);
  body.set("payment_plan[number_of_installments]", String(installments));
  if (offer.billingInterval) {
    body.set("payment_plan[first_billing_interval]", offer.billingInterval);
    body.set("payment_plan[other_billing_intervals]", offer.billingInterval);
  }

  if (ctx.upgradeOrderId) {
    body.set("payment_plan[upgrade_order_id]", ctx.upgradeOrderId);
    body.set("payment_plan[upgrade_type]", ctx.upgradeType ?? "upgrade");
    body.set("settings[hide_double_buy_info]", "Y");
  }

  if (offer.forceRebilling) body.set("settings[force_rebilling]", "Y");

  if (offer.title) body.set("placeholders[TITLE]", offer.title);
  if (offer.description) body.set("placeholders[DESCRIPTION]", offer.description);
  if (thankyouUrl) body.set("urls[thankyou_url]", thankyouUrl);
  if (ctx.customTracking) body.set("tracking[custom]", ctx.customTracking);

  if (ctx.buyer) {
    body.set("buyer[email]", ctx.buyer.email);
    body.set("buyer[readonly_keys]", "email");
    if (ctx.buyer.firstName) body.set("buyer[first_name]", ctx.buyer.firstName);
    if (ctx.buyer.lastName) body.set("buyer[last_name]", ctx.buyer.lastName);
  }

  if (ctx.affiliate) body.set("tracking[affiliate]", ctx.affiliate);
  if (ctx.campaignKey) {
    body.set(
      ctx.affiliate ? "tracking[campaignkey]" : "tracking[trackingkey]",
      ctx.campaignKey,
    );
  } else if (ctx.trackingKey) {
    body.set("tracking[trackingkey]", ctx.trackingKey);
  }

  return body;
}

/**
 * Does this error look like "the affiliate does not exist"?
 *
 * Digistore24 rejects an unknown affiliate with DS_ERR_NOT_FOUND and puts the
 * name we sent into the message (createBuyUrl.php → `_validate_affiliate`).
 * There is no machine-readable marker beyond that, so this is deliberately a
 * heuristic: the name we sent has to appear in the message.
 *
 * Narrow on purpose. Retrying on *any* error would swallow a network failure,
 * an invalid key or an unknown product and report the second attempt's error
 * instead of the real cause.
 */
export function isUnknownAffiliateError(err: unknown, affiliate: string): boolean {
  if (!affiliate) return false;
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes(affiliate.toLowerCase());
}

/**
 * Calls createBuyUrl and returns the buy URL. Throws on error (no mock
 * fallback). If — and only if — the affiliate is unknown, it retries once
 * without the affiliate so a typo in a partner link does not block the purchase
 * entirely. If that retry fails too, the ORIGINAL error is thrown: it names the
 * actual cause, the retry only says that a link without an affiliate failed as
 * well.
 *
 * The URL comes back UNDECORATED. In DEV a checkout link has to end in
 * `withTestpayParam(url)` or there is no way to make a test purchase locally;
 * outside DEV that call is a no-op and appending the parameter by hand would
 * hand the product out for free. See the file header — and prefer
 * `checkoutLinkFor()`, which does all of it already.
 */
export async function createBuyUrl(
  apiKey: string,
  offer: Offer,
  ctx: BuyerContext = {},
  thankyouUrl?: string,
): Promise<string> {
  const params = Object.fromEntries(
    buildBuyUrlBody(offer, ctx, thankyouUrl).entries(),
  );
  try {
    const data = await ds24Post("createBuyUrl", apiKey, params);
    const url = (data.data as { url?: string } | undefined)?.url;
    if (!url) throw new Error("Digistore24 returned no buy URL.");
    return url;
  } catch (err) {
    if (!ctx.affiliate || !isUnknownAffiliateError(err, ctx.affiliate)) throw err;
    try {
      return await createBuyUrl(
        apiKey,
        offer,
        { ...ctx, affiliate: undefined },
        thankyouUrl,
      );
    } catch {
      throw err;
    }
  }
}

/**
 * sha256 over the DS24-relevant offer fields (detects offer changes).
 *
 * `customTracking` belongs in here even though it lives on the context. A URL
 * only reaches this function when the value is one of the CACHEABLE forms —
 * an intent reference makes the URL user-specific and bypasses the cache
 * entirely (see isUserSpecific). What is left are the token markers, and they
 * must still be told apart: were `customTracking` left out of the hash, two
 * offerings sharing an offerKey but differing in their marker
 * ("tokens:<key>") would serve each other's cached URL and credit the wrong
 * package.
 */
export function offerHash(
  offer: Offer,
  thankyouUrl?: string,
  customTracking?: string,
): string {
  const stable = JSON.stringify({
    productId: offer.productId,
    priceCents: offer.priceCents,
    currency: offer.currency ?? "EUR",
    billingInterval: offer.billingInterval ?? null,
    installments: offer.numberOfInstallments ?? null,
    title: offer.title ?? null,
    description: offer.description ?? null,
    validUntil: offer.validUntil ?? "24h",
    forceRebilling: offer.forceRebilling ?? false,
    thankyouUrl: thankyouUrl ?? null,
    customTracking: customTracking ?? null,
  });
  return crypto.createHash("sha256").update(stable).digest("hex");
}

/**
 * Is this URL for one particular person, and therefore unshareable?
 *
 * `customTracking` is tested by CONTENT, not by presence — that distinction is
 * load-bearing. Token packages set `customTracking` on every offering
 * ("tokens:<key>", see checkout.ts), so asking merely whether the field is set
 * would make every token card a live Digistore24 call on every page render,
 * which is exactly what the cache exists to prevent. Only a buyer identity
 * ("m:<memberId>;t:<token>") names a Member.
 *
 * Exported so the distinction can be tested directly: getting it wrong is
 * invisible until either the cache stops working or one buyer's checkout link
 * is served to another.
 */
export function isUserSpecific(ctx: BuyerContext): boolean {
  return Boolean(
    ctx.buyer ||
      ctx.affiliate ||
      ctx.campaignKey ||
      ctx.trackingKey ||
      ctx.upgradeOrderId ||
      identifiesMember(ctx.customTracking),
  );
}

export interface GetOrCreateArgs {
  apiKey: string;
  offer: Offer;
  ctx?: BuyerContext;
  thankyouUrl?: string;
  /** Cache TTL in hours. Default 20 (safety margin below DS24's 24h). */
  ttlHours?: number;
  /** Injectable for tests; default: the real createBuyUrl. */
  creator?: (
    apiKey: string,
    offer: Offer,
    ctx: BuyerContext,
    thankyouUrl?: string,
  ) => Promise<string>;
  /** Injectable for tests. */
  now?: Date;
}

/**
 * Returns a cached buy URL or creates a new one.
 * - User-specific URLs are never cached: buyer/affiliate/campaign/tracking/
 *   upgrade, and any URL carrying a buyer identity. The cache row
 *   is keyed per offering with no member dimension, so a personal URL written
 *   there would be handed to every later visitor.
 * - If the offering changes (offerHash) or the TTL has expired, a new one is
 *   created and the cache updated.
 *
 * Like `createBuyUrl`, it returns an UNDECORATED URL, and here the ordering is
 * the point: the row written to `buy_url_cache` must stay clean, because it is
 * handed to every later visitor. So a DEV path appends the test-payment
 * parameter to the RETURN VALUE — `await withTestpayParam(url)` — and never
 * before this function. See the file header for the environment rule.
 */
export async function getOrCreateBuyUrl(args: GetOrCreateArgs): Promise<string> {
  const ctx = args.ctx ?? {};
  const create = args.creator ?? createBuyUrl;

  if (isUserSpecific(ctx)) {
    return create(args.apiKey, args.offer, ctx, args.thankyouUrl);
  }

  const now = args.now ?? new Date();
  const hash = offerHash(args.offer, args.thankyouUrl, ctx.customTracking);

  const existing = await db.query.buyUrlCache.findFirst({
    where: eq(buyUrlCache.offerKey, args.offer.key),
  });
  if (existing && existing.offerHash === hash && existing.expiresAt > now) {
    return existing.url;
  }

  const url = await create(args.apiKey, args.offer, ctx, args.thankyouUrl);
  const expiresAt = new Date(now.getTime() + (args.ttlHours ?? 20) * 3_600_000);
  await db
    .insert(buyUrlCache)
    .values({
      offerKey: args.offer.key,
      offerHash: hash,
      url,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: buyUrlCache.offerKey,
      set: { offerHash: hash, url, expiresAt, updatedAt: now },
    });
  return url;
}
