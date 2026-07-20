// Digistore24 REST-API-Client.
//
// Authentifizierung: HTTP-Header `X-DS-API-KEY` (NICHT als Form-Parameter).
// Basis-URL: https://www.digistore24.com/api/call/FUNCTION/format/json
//
// Wichtig: Bei Fehlern wird eine Exception geworfen — KEIN stiller Mock-Fallback.
// (Geld-relevant: ein fehlgeschlagener Checkout-Call darf nicht als Erfolg gelten.)
import crypto from "crypto";

// API-Basis über DIGISTORE_URL steuerbar (Standard: https://www.digistore24.com).
export function ds24BaseUrl(): string {
  return process.env.DIGISTORE_URL || "https://www.digistore24.com";
}

/**
 * Low-Level-POST an eine DS24-API-Funktion. Wirft bei HTTP- oder Logik-Fehler
 * (result != success). Gibt die geparste JSON-Antwort zurück.
 * Params dürfen Bracket-Notation nutzen (z. B. "payment_plan[first_amount]").
 */
export async function ds24Post(
  fn: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<{ result: string; data?: Record<string, unknown>; message?: string }> {
  const res = await fetch(`${ds24BaseUrl()}/api/call/${fn}/format/json`, {
    method: "POST",
    headers: {
      "X-DS-API-KEY": apiKey,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Digistore24 API HTTP ${res.status} (${fn}): ${text}`);
  }
  let data: { result?: string; data?: Record<string, unknown>; message?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Digistore24 API ungültiges JSON (${fn}): ${text}`);
  }
  if (data?.result !== "success") {
    throw new Error(data?.message || `Digistore24 API-Fehler (${fn})`);
  }
  return data as { result: string; data?: Record<string, unknown>; message?: string };
}

/**
 * Prüft einen API-Key durch einen leichten Read-Call (getProductList).
 * Gibt true zurück, wenn der Key gültig ist.
 */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    await ds24Post("getProductList", apiKey);
    return true;
  } catch {
    return false;
  }
}

// Die Checkout-URL-Erzeugung (createBuyUrl) inkl. Custom Payment Plan und
// Caching liegt in ./buyUrl.ts.

/**
 * Erzeugt eine neue, zufällige IPN-Passphrase (für die SHA512-Signatur).
 * Der Vendor trägt sie identisch in Digistore24 ein.
 */
export function generateIpnPassphrase(): string {
  return crypto.randomBytes(24).toString("hex");
}
