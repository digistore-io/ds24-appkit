// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What a valid consent is — pure functions, no database, no session.
//
// Everything here is a decision that has to be the same in three places: the
// dialog that asks, the account page that lists what was agreed, and the
// `legal-check` command that reports what is missing. Written once, tested
// once, called from all three.
//
// The reasoning for a human is `docs/compliance.md` §2.

/** Codes the layers below return instead of sentences (the AD-10 rule). */
export const CONSENT_ERROR_CODES = [
  /** The purpose is not declared in `config/consent.json`. */
  "unknownPurpose",
  /** No purposes are declared at all — nothing to consent to. */
  "noPurposes",
] as const;

export type ConsentErrorCode = (typeof CONSENT_ERROR_CODES)[number];

export class ConsentError extends Error {
  constructor(public readonly code: ConsentErrorCode) {
    super(code);
    this.name = "ConsentError";
  }
}

/** One thing a Member can be asked to agree to. */
export interface ConsentPurpose {
  /**
   * Stable id. Written into `consent_records.purpose` and used to look the
   * wording up in `messages/*.json` (`consent.<key>.title` / `.body`), so
   * renaming one orphans every record already given under the old name.
   */
  key: string;
  /**
   * Which version of the wording is current.
   *
   * **This is the field that makes the record mean something.** Consent is
   * consent to something specific (Art. 4(11), Art. 7 GDPR), so a changed
   * sentence is a changed question. Bump this whenever you edit the text, and
   * everyone who agreed to the old one counts as unasked again — which is the
   * honest answer, however inconvenient.
   *
   * A date is the easiest thing to keep straight: "2026-07-26".
   */
  textVersion: string;
}

/** One row of `consent_records`, narrowed to what these rules need. */
export interface ConsentRecord {
  purpose: string;
  granted: boolean;
  textVersion: string;
  createdAt: Date;
}

/**
 * Where a Member stands on one purpose.
 *
 * - `granted`  — agreed, under the wording that is current
 * - `refused`  — said no, or withdrew an earlier yes
 * - `unasked`  — never answered
 * - `stale`    — agreed, but to an older version of the text
 *
 * `stale` and `unasked` are the same instruction (ask) and deliberately not the
 * same state: an app that renders them alike cannot tell an Operator that a
 * wording change just invalidated four hundred consents.
 */
export type ConsentState = "granted" | "refused" | "unasked" | "stale";

/**
 * The newest record wins.
 *
 * The table is append-only, so "current" is not a column — it is the last row
 * for this purpose. A withdrawal is a row with `granted: false` sitting after
 * the row that granted it.
 *
 * Ties are broken toward the *later* entry in the array. Two rows can share a
 * timestamp when a click is repeated inside the same millisecond, and in that
 * case insertion order is the only thing that still says which came second.
 */
export function currentConsent(
  records: readonly ConsentRecord[],
  purpose: ConsentPurpose,
): ConsentState {
  let newest: ConsentRecord | null = null;

  for (const record of records) {
    if (record.purpose !== purpose.key) continue;
    if (newest === null || record.createdAt.getTime() >= newest.createdAt.getTime()) {
      newest = record;
    }
  }

  if (newest === null) return "unasked";
  if (!newest.granted) return "refused";
  return newest.textVersion === purpose.textVersion ? "granted" : "stale";
}

/**
 * May the app do the thing this purpose covers?
 *
 * The only question a feature should ask. Note what is NOT permission: `stale`
 * is a yes to a question you have since changed, and treating it as a yes is
 * processing without a basis while believing you have one.
 */
export function isAllowed(state: ConsentState): boolean {
  return state === "granted";
}

/**
 * Should the person be asked?
 *
 * A refusal is an answer, and re-asking somebody who declined is what turns a
 * consent dialog into nagging — the ICO and the German DPAs both treat repeated
 * prompting as undermining "freely given". So: ask when never asked, and ask
 * again when the wording genuinely changed. Never because a week has passed.
 */
export function needsAsking(state: ConsentState): boolean {
  return state === "unasked" || state === "stale";
}

/**
 * Is this a usable purpose key?
 *
 * Lowercase letters, digits and underscores. It ends up in a database column,
 * in a translation key and in a JSON file, and the intersection of what those
 * three tolerate is narrower than any of them alone.
 */
export function isValidPurposeKey(key: unknown): key is string {
  return typeof key === "string" && /^[a-z][a-z0-9_]{1,48}$/.test(key);
}

/** Is this a usable version marker? Anything short and non-empty. */
export function isValidTextVersion(version: unknown): version is string {
  return typeof version === "string" && version.trim() !== "" && version.trim().length <= 64;
}
