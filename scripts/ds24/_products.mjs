// Shared helpers for the product registry (config/digistore-products.json).
// Reading/writing the config, so that sync-products & request-approval use the
// same source as the app (lib/digistore/products.ts).
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
    throw new Error("Invalid config/digistore-products.json (no products object).");
  }
  return json;
}

/** Writes the config back, formatted (2 spaces, trailing newline). */
export function writeProducts(json) {
  writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 2) + "\n");
}

/** listProducts (readonly) → normalized list. */
export function extractProducts(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.products)) return data.products;
  return [];
}

export function idOf(p) {
  return p.product_id ?? p.id ?? null;
}
