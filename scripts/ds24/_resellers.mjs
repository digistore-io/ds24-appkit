// Digistore24 resellers (= marketplace/siteowner IDs for the product approval).
//
// The IDs are stable (source: https://www.digistore24.com/support/resellers.json)
// and therefore hard-coded here — no network call needed at runtime. New
// resellers are added rarely; if one shows up, add it here.
//
// Rule for the approval (see resolveReseller): if the app is German-speaking,
// the Germany reseller (1) is used, otherwise the USA reseller (2). Both can be
// overridden via --siteowner / --reseller / --lang.

export const RESELLERS = {
  DE: { id: "1", name: "Digistore24 GmbH (Germany)", country: "DE" },
  US: { id: "2", name: "Digistore24 Inc. (United States)", country: "US" },
  GB: { id: "3", name: "Digistore24 LTD (United Kingdom)", country: "GB" },
  IE: { id: "4", name: "Digistore24 MSLW Limited (Ireland)", country: "IE" },
};

/** Derive the reseller from the language: German → Germany, otherwise USA. */
export function resellerForLang(lang) {
  return String(lang || "")
    .trim()
    .toLowerCase()
    .startsWith("de")
    ? RESELLERS.DE
    : RESELLERS.US;
}

/**
 * Determine the siteowner/reseller ID for the product approval. Order:
 *   1) explicit siteowner ID (siteowner) — any marketplace, including a
 *      private one; always wins.
 *   2) explicit reseller key/country code (reseller: DE|US|GB|IE).
 *   3) otherwise derived from the language (resellerForLang).
 *
 * Returns: { id, source: "siteowner"|"reseller"|"lang", reseller: <entry>|null }.
 * Only throws on an unknown reseller key.
 */
export function resolveReseller({ siteowner, reseller, lang } = {}) {
  if (siteowner != null && String(siteowner).trim() !== "") {
    return { id: String(siteowner).trim(), source: "siteowner", reseller: null };
  }
  if (reseller != null && String(reseller).trim() !== "") {
    const key = String(reseller).trim().toUpperCase();
    const r = RESELLERS[key];
    if (!r) {
      throw new Error(
        `Unknown reseller "${reseller}". Known: ${Object.keys(RESELLERS).join(", ")} ` +
          `(or --siteowner <id> for a different marketplace).`,
      );
    }
    return { id: r.id, source: "reseller", reseller: r };
  }
  const r = resellerForLang(lang);
  return { id: r.id, source: "lang", reseller: r };
}
