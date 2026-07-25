// Digistore24 REST API client.
//
// Authentication: HTTP header `X-DS-API-KEY` (NOT as a form parameter).
// Base URL: https://www.digistore24.com/api/call/FUNCTION/format/json
//
// Important: errors throw an exception — NO silent mock fallback.
// (Money-relevant: a failed checkout call must not count as a success.)
import crypto from "crypto";
import { DIGISTORE_API_URL } from "./config.mjs";

// The API base is the same for every installation and is therefore not a
// setting — it lives in lib/digistore/config.mjs, not in the .env.
export function ds24BaseUrl(): string {
  return DIGISTORE_API_URL;
}

/**
 * Low-level POST to a DS24 API function. Throws on HTTP or logic errors
 * (result != success). Returns the parsed JSON response.
 * Params may use bracket notation (e.g. "payment_plan[first_amount]").
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
    throw new Error(`Digistore24 API returned invalid JSON (${fn}): ${text}`);
  }
  if (data?.result !== "success") {
    throw new Error(data?.message || `Digistore24 API-Fehler (${fn})`);
  }
  return data as { result: string; data?: Record<string, unknown>; message?: string };
}

/**
 * Validates an API key with a lightweight read call (listProducts).
 * Returns true if the key is valid.
 */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    await ds24Post("listProducts", apiKey);
    return true;
  } catch {
    return false;
  }
}

// Building the checkout URL (createBuyUrl), including the custom payment plan
// and caching, lives in ./buyUrl.ts.

/**
 * Generates a new random IPN passphrase (for the SHA512 signature).
 * The vendor enters the identical value in Digistore24.
 */
export function generateIpnPassphrase(): string {
  return crypto.randomBytes(24).toString("hex");
}
