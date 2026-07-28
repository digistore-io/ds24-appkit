// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

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

const RESELLER_IDS = new Set(Object.values(RESELLERS).map((r) => r.id));

/**
 * Is this siteowner one of the four RESELLERS — the only ones that have a
 * product approval at all?
 *
 * **A siteowner that is not in this set is a Direct Seller**, and Digistore24
 * has no approval concept for one: the vendor sells on their own account, and
 * there is nobody to submit a product to. Everything this project does around
 * approval — requesting it, reading it back, the reminder in the session
 * greeting — simply does not apply there, and pretending otherwise produces
 * either a meaningless write or a reminder that can never be satisfied.
 *
 * So this is not a validation nicety. It is the difference between a feature
 * and a permanent false alarm.
 */
export function isReseller(siteownerId) {
  return RESELLER_IDS.has(String(siteownerId ?? "").trim());
}

/**
 * The language codes Digistore24 itself uses on a product (probed 2026-07-28:
 * de, en, fr, es, nl, it, pt, pl, sl). Region suffixes are fine — "de-AT" and
 * "de_CH" are German.
 */
const KNOWN_LANGUAGES = ["de", "en", "fr", "es", "nl", "it", "pt", "pl", "sl"];

const normalizeLang = (lang) => String(lang ?? "").trim().toLowerCase();

/**
 * Is this a language code we recognise? Used to WARN rather than to decide —
 * the rule below still has to answer something for every input.
 *
 * It exists because the decision is money-relevant and silent: "german" and
 * "ger" do not start with "de", so a product a non-developer labelled that way
 * is submitted to the USA marketplace with no hint that anything was
 * misunderstood. `startsWith("de")` cannot tell a wrong code from a foreign one.
 */
export function isKnownLanguage(lang) {
  const value = normalizeLang(lang);
  if (!value) return false;
  return KNOWN_LANGUAGES.some((code) => value === code || value.startsWith(`${code}-`) || value.startsWith(`${code}_`));
}

/**
 * Derive the reseller from a language: German → Germany, otherwise USA.
 *
 * WHOSE language is the caller's decision and it matters — `request-approval`
 * passes the PRODUCT's, so an app selling in two languages submits each product
 * where it belongs. Passing the app's `APP_LANG` for all of them is the older
 * behaviour and is now only the fallback for a product that names none.
 */
export function resellerForLang(lang) {
  return normalizeLang(lang).startsWith("de") ? RESELLERS.DE : RESELLERS.US;
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
