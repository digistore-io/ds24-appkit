// Zentrale Produkt-Registry: EIN Digistore24-Produkt je Angebot (Abo-Tarif oder
// Token-Paket). Source of Truth ist die Config-Datei `config/digistore-products.json`.
//
// Ablauf (siehe docs/digistore-billing-modes.md):
//   1. Produkte in der JSON deklarieren.
//   2. `scripts/ds24/sync-products.mjs` legt sie via createProduct an bzw.
//      aktualisiert sie via updateProduct und schreibt die `productId` zurueck.
//   3. Checkout laeuft ueber den Produkt-Link `…/product/<id>` (kein createBuyUrl).
//   4. Preis/Intervall werden je Produkt als DS24-Payment-Plan gepflegt.
//
// Alle Umgebungen (DEV/STAGING/PROD) nutzen DIESELBEN Live-Produkte — es gibt genau
// eine `productId` je Angebot.
import { ds24BaseUrl } from "./client";
import productsFile from "@/config/digistore-products.json";

export type ProductKind = "subscription" | "token" | "one_time";

export interface ProductDef {
  /** Stabiler Schluessel (z. B. "pro"). */
  key: string;
  /** DS24-Produktname (dient auch als name_intern fuers Matching). */
  name: string;
  description?: string;
  kind: ProductKind;
  /** Abo-Intervall (Anzeige; real im DS24-Payment-Plan). z. B. "1_month". */
  billingInterval?: string;
  /** Token-Guthaben je Kauf (nur kind="token"). */
  credits?: number;
  /**
   * Preis in Cent. Wird beim Checkout als payment_plan mitgegeben
   * (lib/digistore/buyUrl.ts) — am DS24-Produkt selbst wird kein Preis gesetzt.
   */
  priceCents?: number;
  currency?: string;
  /** Kurzer Zusatz unter dem Namen auf der Tarif-Seite. */
  tagline?: string;
  /** Aufzählungspunkte auf der Tarif-Seite. */
  features?: string[];
  /** Hebt den Tarif auf der Seite hervor („beliebteste Wahl"). */
  highlight?: boolean;
  /** Produktbild für Digistore24 (öffentlich erreichbare URL). */
  imageUrl?: string | null;
  /** Von sync-products.mjs gesetzte Live-Produkt-ID (null = noch nicht angelegt). */
  productId?: string | null;
}

/** Preis als „19,00 €" formatiert. */
export function formatPrice(def: ProductDef): string {
  if (def.priceCents == null) return "auf Anfrage";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: def.currency ?? "EUR",
  }).format(def.priceCents / 100);
}

/** Abrechnungsintervall als Suffix für die Anzeige, z. B. „/ Monat". */
export function intervalLabel(def: ProductDef): string {
  if (def.kind !== "subscription") return "einmalig";
  if (def.billingInterval === "1_month") return "pro Monat";
  if (def.billingInterval === "12_month") return "pro Jahr";
  return def.billingInterval ?? "";
}

interface ProductsFile {
  products: Record<string, Omit<ProductDef, "key">>;
}

const raw = productsFile as unknown as ProductsFile;

/** Alle deklarierten Produkte (mit aufgeloestem key). */
export function allProducts(): ProductDef[] {
  return Object.entries(raw.products).map(([key, def]) => ({ key, ...def }));
}

/** Produkt-Definition oder wirft bei unbekanntem Schluessel. */
export function getProduct(key: string): ProductDef {
  const def = raw.products[key];
  if (!def) throw new Error(`Unbekanntes Produkt: ${key}`);
  return { key, ...def };
}

/** Produkte eines Typs (z. B. alle Token-Pakete). */
export function productsByKind(kind: ProductKind): ProductDef[] {
  return allProducts().filter((p) => p.kind === kind);
}

/**
 * Live-Produkt-ID eines Angebots. Wirft, wenn noch nicht synchronisiert
 * (scripts/ds24/sync-products.mjs ausfuehren).
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

export interface BuyLinkContext {
  /** E-Mail vorbelegen. */
  email?: string;
  /** Freier Kontext — kommt im IPN unter `custom` an (z. B. "tokens:pro"). */
  custom?: string;
  affiliate?: string;
  campaignKey?: string;
  trackingKey?: string;
}

/**
 * Baut den Checkout-Link fuer ein Produkt: `<base>/product/<id>?…`.
 * Preis/Intervall stammen aus dem DS24-Payment-Plan des Produkts. Ersetzt
 * createBuyUrl fuer den managed-products-Weg.
 */
export function productBuyUrl(key: string, ctx: BuyLinkContext = {}): string {
  const id = productId(key);
  const params = new URLSearchParams();
  if (ctx.email) params.set("email", ctx.email);
  if (ctx.custom) params.set("custom", ctx.custom);
  if (ctx.affiliate) params.set("aff", ctx.affiliate);
  if (ctx.campaignKey) params.set("campaignkey", ctx.campaignKey);
  if (ctx.trackingKey) params.set("trackingkey", ctx.trackingKey);
  const qs = params.toString();
  return `${ds24BaseUrl()}/product/${id}${qs ? `?${qs}` : ""}`;
}
