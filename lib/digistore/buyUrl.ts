// Checkout-URL-Erzeugung über Digistore24 `createBuyUrl` mit Custom Payment Plan
// und Caching. Referenz: docs/digistore-createbuyurl.md.
//
// Kernidee: Preis/Währung/Intervall werden zur Laufzeit als kompletter
// payment_plan[...] mitgeschickt — nicht in Digistore gepflegt. Ergebnis ist eine
// kurzlebige (24h) signierte Checkout-URL. Diese wird pro Angebot gecacht; ändert
// sich das Angebot, entsteht eine neue URL.
import crypto from "crypto";
import { ds24Post } from "./client";
import { db } from "@/db";
import { buyUrlCache } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface Offer {
  /** Stabiler Schlüssel des Angebots (z. B. "gold"). Cache-Schlüssel pro Vendor. */
  key: string;
  /** Digistore-Produkt-ID des zugehörigen Basisprodukts. */
  productId: string;
  /** Preis in Cent. */
  priceCents: number;
  /** Währung, Default "EUR". */
  currency?: string;
  /** z. B. "1_month" | "12_month". Weglassen = Einmalzahlung. */
  billingInterval?: string;
  /** 0 = Abo (unbegrenzt), 1 = Einmalzahlung. Default: 0 wenn Intervall gesetzt, sonst 1. */
  numberOfInstallments?: number;
  /** Anzeigetitel auf der Checkout-Seite (Platzhalter {TARIF}). */
  title?: string;
  /** Anzeigebeschreibung (Platzhalter {DESCRIPTION}). */
  description?: string;
  /** Gültigkeit der Buy-URL, Default "24h". */
  validUntil?: string;
  /**
   * settings[force_rebilling]=Y — erzwingt hinterlegte Zahlungsdaten, auch bei
   * Einmalkäufen. Voraussetzung, um später per createBillingOnDemand (Token-
   * Nachkauf/Auto-Aufladen) gegen diesen Kauf abzubuchen. Bei echten Abos
   * (billingInterval) ist es nicht nötig, schadet aber nicht.
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
  /** Freier Kontext, der im IPN unter tracking[custom] ankommt. */
  customTracking?: string;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Baut den x-www-form-urlencoded Body für createBuyUrl (pure, testbar). */
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
 * Ruft createBuyUrl auf und gibt die Buy-URL zurück. Wirft bei Fehler
 * (kein Mock-Fallback). Bei ungültigem Affiliate wird einmal ohne Affiliate
 * wiederholt, damit ein Tippfehler den Kauf nicht komplett verhindert.
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
    if (!url) throw new Error("Digistore24 lieferte keine Buy-URL zurück.");
    return url;
  } catch (err) {
    if (ctx.affiliate) {
      return createBuyUrl(apiKey, offer, { ...ctx, affiliate: undefined }, thankyouUrl);
    }
    throw err;
  }
}

/** sha256 über die DS24-relevanten Angebotsfelder (erkennt Angebotsänderungen). */
export function offerHash(offer: Offer, thankyouUrl?: string): string {
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
  });
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function isUserSpecific(ctx: BuyerContext): boolean {
  return Boolean(
    ctx.buyer ||
      ctx.affiliate ||
      ctx.campaignKey ||
      ctx.trackingKey ||
      ctx.upgradeOrderId,
  );
}

export interface GetOrCreateArgs {
  apiKey: string;
  /** Vendor (Betreiber), Cache-Namespace. */
  userId: string;
  offer: Offer;
  ctx?: BuyerContext;
  thankyouUrl?: string;
  /** Cache-TTL in Stunden. Default 20 (Sicherheitspuffer unter DS24s 24h). */
  ttlHours?: number;
  /** Injizierbar für Tests; Default: echtes createBuyUrl. */
  creator?: (
    apiKey: string,
    offer: Offer,
    ctx: BuyerContext,
    thankyouUrl?: string,
  ) => Promise<string>;
  /** Injizierbar für Tests. */
  now?: Date;
}

/**
 * Liefert eine gecachte Buy-URL oder erzeugt eine neue.
 * - Nutzerspezifische URLs (buyer/affiliate/campaign/tracking/upgrade) werden
 *   nie gecacht.
 * - Ändert sich das Angebot (offerHash) oder ist die TTL abgelaufen, wird neu
 *   erzeugt und der Cache aktualisiert.
 */
export async function getOrCreateBuyUrl(args: GetOrCreateArgs): Promise<string> {
  const ctx = args.ctx ?? {};
  const create = args.creator ?? createBuyUrl;

  if (isUserSpecific(ctx)) {
    return create(args.apiKey, args.offer, ctx, args.thankyouUrl);
  }

  const now = args.now ?? new Date();
  const hash = offerHash(args.offer, args.thankyouUrl);

  const existing = await db.query.buyUrlCache.findFirst({
    where: and(
      eq(buyUrlCache.userId, args.userId),
      eq(buyUrlCache.offerKey, args.offer.key),
    ),
  });
  if (existing && existing.offerHash === hash && existing.expiresAt > now) {
    return existing.url;
  }

  const url = await create(args.apiKey, args.offer, ctx, args.thankyouUrl);
  const expiresAt = new Date(now.getTime() + (args.ttlHours ?? 20) * 3_600_000);
  await db
    .insert(buyUrlCache)
    .values({
      userId: args.userId,
      offerKey: args.offer.key,
      offerHash: hash,
      url,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [buyUrlCache.userId, buyUrlCache.offerKey],
      set: { offerHash: hash, url, expiresAt, updatedAt: now },
    });
  return url;
}
