// Token-Pakete (Prepaid-Guthaben) — abgeleitet aus der zentralen Produkt-Registry
// (`config/digistore-products.json`, kind = "token"). Ein Paket = ein DS24-Produkt;
// die `productId` liefert die Registry (via lib/digistore/products.ts).
//
// Der `key` ist stabil und taucht als "tokens:<key>" im DS24-`custom`-Feld auf,
// damit der IPN-Handler eine Zahlung einer Gutschrift zuordnen kann.
import { getProduct, productsByKind, type ProductDef } from "@/lib/digistore/products";

export interface TokenPackage {
  key: string;
  title: string;
  credits: number;
  priceCents: number;
  currency: string;
}

function toTokenPackage(p: ProductDef): TokenPackage {
  if (p.kind !== "token" || typeof p.credits !== "number") {
    throw new Error(`Produkt "${p.key}" ist kein Token-Paket.`);
  }
  return {
    key: p.key,
    title: p.name,
    credits: p.credits,
    priceCents: p.priceCents ?? 0,
    currency: p.currency ?? "EUR",
  };
}

/** Alle Token-Pakete. */
export function listTokenPackages(): TokenPackage[] {
  return productsByKind("token").map(toTokenPackage);
}

/** Liefert ein Token-Paket oder wirft (unbekannt oder kein Token-Produkt). */
export function getTokenPackage(key: string): TokenPackage {
  return toTokenPackage(getProduct(key));
}

/** Baut den DS24-custom-Marker, über den der IPN eine Gutschrift zuordnet. */
export function tokenCustomMarker(key: string): string {
  return `tokens:${key}`;
}

/**
 * Parst den custom-Marker aus einem IPN-Payload zurück in einen Paketschlüssel.
 * Gibt null zurück, wenn es kein Token-Kauf ist.
 */
export function parseTokenCustomMarker(custom: string | undefined): string | null {
  if (!custom) return null;
  const m = /^tokens:([A-Za-z0-9_-]+)$/.exec(custom.trim());
  return m ? m[1] : null;
}
