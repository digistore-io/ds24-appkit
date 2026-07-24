// Shared Digistore24 API client for the setup scripts (plain Node ESM).
// Auth: header X-DS-API-KEY. Base URL via DIGISTORE_URL (test/prod).
//
// Env:
//   DIGISTORE_API_KEY  (required in order to run; for product/IPN management
//                       usually a "writable" or "developer" key)
//   DIGISTORE_URL      (optional; defaults to prod)
//
// The .env is loaded automatically (scripts/lib/env.mjs); variables already set
// in the shell take precedence.
import "../lib/env.mjs";

export function baseUrl() {
  return process.env.DIGISTORE_URL || "https://www.digistore24.com";
}

export function requireApiKey() {
  const key = process.env.DIGISTORE_API_KEY;
  if (!key) {
    console.error("ERROR: DIGISTORE_API_KEY is not set.");
    process.exit(2);
  }
  return key;
}

/**
 * Calls a DS24 API function. Params may use bracket notation.
 * Throws on an HTTP error or a logical error (result != success).
 */
export async function ds24Call(fn, apiKey, params = {}) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${baseUrl()}/api/call/${fn}/format/json`, {
    method: "POST",
    headers: {
      "X-DS-API-KEY": apiKey,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DS24 HTTP ${res.status} (${fn}): ${text}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`DS24 invalid JSON (${fn}): ${text}`);
  }
  if (data.result !== "success") {
    throw new Error(`DS24 API error (${fn}): ${data.message || "unknown"}`);
  }
  return data.data;
}

/**
 * Digistore24 answers boolean fields with the STRINGS "Y" and "N" (see
 * base.php → bool() in the API source). In JavaScript **both are truthy**, so
 * `if (res.created)` is true even when nothing was created — which is exactly
 * how `ipnSetup` came to report "created" on every update. Every Y/N field
 * goes through here.
 */
export function isYes(value) {
  if (value === true || value === 1) return true;
  const v = String(value ?? "").trim().toUpperCase();
  return v === "Y" || v === "1" || v === "TRUE";
}

/**
 * Minimal flag parser: --key value  and  --flag (boolean).
 * @returns {Record<string, string | true>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | true>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}
