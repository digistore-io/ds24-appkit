// Gemeinsamer Digistore24-API-Client für die Setup-Skripte (reines Node ESM).
// Auth: Header X-DS-API-KEY. Basis über DIGISTORE_URL (Test/Prod).
//
// Env:
//   DIGISTORE_API_KEY  (erforderlich zum Ausführen; für Produkt-/IPN-Verwaltung
//                       i. d. R. ein "writable"- bzw. "developer"-Key)
//   DIGISTORE_URL      (optional; Default Prod)

export function baseUrl() {
  return process.env.DIGISTORE_URL || "https://www.digistore24.com";
}

export function requireApiKey() {
  const key = process.env.DIGISTORE_API_KEY;
  if (!key) {
    console.error("FEHLER: DIGISTORE_API_KEY ist nicht gesetzt.");
    process.exit(2);
  }
  return key;
}

/**
 * Ruft eine DS24-API-Funktion auf. Params dürfen Bracket-Notation nutzen.
 * Wirft bei HTTP- oder Logik-Fehler (result != success).
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
    throw new Error(`DS24 ungültiges JSON (${fn}): ${text}`);
  }
  if (data.result !== "success") {
    throw new Error(`DS24 API-Fehler (${fn}): ${data.message || "unbekannt"}`);
  }
  return data.data;
}

/** Minimaler Flag-Parser: --key value  und  --flag (boolean). */
export function parseArgs(argv) {
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
