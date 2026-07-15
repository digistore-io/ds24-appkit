// Gemeinsame Helfer für die Produkt-Registry (config/digistore-products.json).
// Lesen/Schreiben der Config, damit sync-products & request-approval dieselbe
// Quelle nutzen wie die App (lib/digistore/products.ts).
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const CONFIG_URL = new URL(
  "../../config/digistore-products.json",
  import.meta.url,
);
export const CONFIG_PATH = fileURLToPath(CONFIG_URL);

export function readProducts() {
  const json = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!json || typeof json.products !== "object") {
    throw new Error("Ungültige config/digistore-products.json (kein products-Objekt).");
  }
  return json;
}

/** Schreibt die Config formatiert zurück (2 Spaces, abschließender Newline). */
export function writeProducts(json) {
  writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 2) + "\n");
}

/** getProductList (readonly) → normalisierte Liste. */
export function extractProducts(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.products)) return data.products;
  return [];
}

export function idOf(p) {
  return p.product_id ?? p.id ?? null;
}
