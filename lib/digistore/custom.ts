// The grammar of the Digistore24 `tracking[custom]` field.
//
// Digistore24 stores whatever we send in `tracking[custom]` on the purchase
// itself (as `merchant_custom`) and hands it back on EVERY later event for
// that purchase — the renewal a year on, the refund, the chargeback. That is
// what makes it the right carrier for identity: a buyer email is typed by the
// buyer, never verified by Digistore24, and a Member may change theirs. This
// value cannot change and was written by us.
//
// The format is `;`-separated `key:value` pairs:
//
//   m:<memberId>;t:<checkoutToken>;p:<productKey>
//
//   m  the Member the purchase belongs to
//   t  that Member's checkout token — corroborates `m`
//   p  the Product Key bought, so nothing has to be reverse-looked-up later
//
// EXTENSIBLE BY DESIGN. A new id is a new pair; unknown keys are ignored
// rather than fatal, so an older parser keeps working against a newer writer.
// Never introduce a second format — add a pair.
//
// `m` and `t` must BOTH be present and well-formed, or the value resolves to
// nothing and attribution falls through to the buyer email. A member id on its
// own is never enough. Note what the token is NOT: Digistore24 stores this
// value server-side and returns a URL that merely references it, so a buyer
// cannot edit it. The token is defence in depth — do not treat it as tamper
// protection, and do not build anything that relies on it as one.
//
// The `tokens:<key>` marker is already a valid pair, so it costs no special
// case. It is STILL EMITTED — an anonymous checkout has no Member to name, so
// checkout.ts falls back to it (customTrackingFor). It also arrives from
// checkout URLs already in buyers' hands and from purchases made before this
// shipped. It must parse forever. If it stopped parsing, the IPN handler would
// not recognise a token purchase — the balance would never be credited
// although the money was taken, and the purchase would be filed as a
// subscription instead.
//
// Pure functions only — no database, no I/O.

import crypto from "crypto";

/** A parsed `tracking[custom]` value. `null` means "not ours, or incomplete". */
export type CustomValue =
  | {
      kind: "identity";
      memberId: string;
      checkoutToken: string;
      productKey: string | undefined;
      /** How the purchase was initiated: subscription, one-off top-up, or an
       *  unattended auto top-up. Undefined when the writer did not say. */
      origin: PurchaseOrigin | undefined;
    }
  | { kind: "legacyToken"; productKey: string };

// Canonical UUID as produced by crypto.randomUUID(). Deliberately strict: a
// loose pattern would let a stray value be read as a member that does not
// exist.
const MEMBER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9]{10}$/;
const PRODUCT_KEY_RE = /^[A-Za-z0-9_-]+$/;

/** The recognised values of the `k:` pair. */
export type PurchaseOrigin = "sub" | "topup" | "auto";
const ORIGINS: readonly PurchaseOrigin[] = ["sub", "topup", "auto"];

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Is this a well-formed checkout token? */
export function isCheckoutToken(value: string | undefined | null): boolean {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** A fresh checkout token: 10 alphanumerics from a cryptographic source. */
export function newCheckoutToken(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

/** Builds the value that travels to Digistore24 with a purchase. */
export function buildIdentity(input: {
  memberId: string;
  checkoutToken: string;
  productKey?: string;
  kind?: PurchaseOrigin;
}): string {
  const pairs = [`m:${input.memberId}`, `t:${input.checkoutToken}`];
  if (input.productKey) pairs.push(`p:${input.productKey}`);
  if (input.kind) pairs.push(`k:${input.kind}`);
  return pairs.join(";");
}

/**
 * Parses a `tracking[custom]` value coming back from Digistore24.
 * Returns null for an absent, foreign or half-formed value.
 */
export function parseCustom(
  custom: string | undefined | null,
): CustomValue | null {
  if (!custom) return null;
  const value = custom.trim();
  if (!value) return null;

  const pairs = new Map<string, string>();
  for (const part of value.split(";")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const key = part.slice(0, at).trim();
    const val = part.slice(at + 1).trim();
    if (key && val && !pairs.has(key)) pairs.set(key, val);
  }

  const memberId = pairs.get("m");
  const checkoutToken = pairs.get("t");
  if (memberId && checkoutToken) {
    // Both halves, both well-formed, or nothing. Half an identity is not a
    // weaker identity — it is no identity.
    if (!MEMBER_RE.test(memberId) || !TOKEN_RE.test(checkoutToken)) return null;
    const productKey = pairs.get("p");
    const rawKind = pairs.get("k");
    const origin =
      rawKind && (ORIGINS as readonly string[]).includes(rawKind)
        ? (rawKind as PurchaseOrigin)
        : undefined;
    return {
      kind: "identity",
      memberId,
      checkoutToken,
      productKey:
        productKey && PRODUCT_KEY_RE.test(productKey) ? productKey : undefined,
      origin,
    };
  }

  const legacy = pairs.get("tokens");
  if (legacy && PRODUCT_KEY_RE.test(legacy)) {
    return { kind: "legacyToken", productKey: legacy };
  }

  return null;
}

/**
 * Does this value identify a single Member?
 *
 * The buy-URL cache asks this before deciding whether a generated checkout URL
 * may be shared (lib/digistore/buyUrl.ts → isUserSpecific). It MUST test the
 * content, not merely whether the field is set: token packages set
 * `customTracking` on every offering, so a presence check would make every
 * token card a live Digistore24 call on every page render.
 */
export function identifiesMember(custom: string | undefined | null): boolean {
  return parseCustom(custom)?.kind === "identity";
}
