// Digistore24 IPN signature check — per the official DS24 example
// (https://www.digistore24.com/download/ipn/examples/ipn/sha_sign.php).
//
// Algorithm:
//   1. Remove the parameters `sha_sign` and `SHASIGN`.
//   2. Sort the keys (SORT_STRING).
//   3. Skip empty values (undefined/null/"").
//   4. Concatenate `KEY=VALUE` + passphrase per parameter.
//   5. Compute the SHA512 hash, result in uppercase.
//   6. Compare case-insensitively (timing-safe) with the supplied `sha_sign`.
//
// The KEY CASE is the one field where Digistore24 accounts differ. The example
// has a `convert_keys_to_uppercase` switch; observed live, Digistore24 signs
// with the ORIGINAL field names (`order_id=…`), NOT uppercased (`ORDER_ID=…`).
// So the default here is original-case — and verifyIpnSignature accepts EITHER,
// so a connection configured the other way still validates (both variants need
// the secret passphrase, so accepting both costs no security). Getting this
// wrong is exactly the "Signatur ungültig" on an otherwise valid IPN.
import crypto from "crypto";

export type IpnParams = Record<string, string>;

/**
 * Computes the DS24 SHA signature over the IPN parameters.
 * @param algorithm     "sha512" by default (the DS24 default). SHA1/others for
 *                      legacy only.
 * @param uppercaseKeys Uppercase the field names before signing
 *                      (convert_keys_to_uppercase). Default false — Digistore24
 *                      signs with the original case. verifyIpnSignature tries
 *                      both, so callers rarely set this.
 */
export function digistoreShaSign(
  params: IpnParams,
  passphrase: string,
  algorithm: string = "sha512",
  uppercaseKeys: boolean = false,
): string {
  const prepared = Object.entries(params)
    .filter(([key]) => {
      const up = key.toUpperCase();
      return up !== "SHA_SIGN" && up !== "SHASIGN";
    })
    .map(([key, value]) => ({ key: uppercaseKeys ? key.toUpperCase() : key, value }))
    // SORT_STRING over the keys (byte order, as PHP's ksort(SORT_STRING)).
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let shaString = "";
  for (const { key, value } of prepared) {
    if (value === undefined || value === null || value === "") continue;
    shaString += `${key}=${value}${passphrase}`;
  }

  return crypto
    .createHash(algorithm)
    .update(shaString, "utf8")
    .digest("hex")
    .toUpperCase();
}

/**
 * Verifies the IPN signature. Fail closed: without a passphrase or without
 * `sha_sign` the check fails.
 */
export function verifyIpnSignature(
  params: IpnParams,
  passphrase: string,
  algorithm: string = "sha512",
): boolean {
  const received = params["sha_sign"] ?? params["SHASIGN"];
  if (!received || !passphrase) return false;

  const a = Buffer.from(received.toUpperCase(), "utf8");
  // Accept either key-case convention (see the file header). Both variants
  // require the passphrase, so trying both is safe; it just spares the operator
  // from having to match convert_keys_to_uppercase to their DS24 connection.
  for (const uppercaseKeys of [false, true]) {
    const expected = digistoreShaSign(params, passphrase, algorithm, uppercaseKeys);
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// --- Event → Order-Status ----------------------------------------------------

export type OrderStatus =
  | "paid"
  | "refunded"
  | "chargeback"
  | "paused"
  | "cancelled";

/**
 * Maps a DS24 IPN event to an order status.
 * Returns null for events that trigger no status change (e.g.
 * connection_test, purely informational events).
 */
export function mapEventToStatus(event: string): OrderStatus | null {
  switch (event) {
    case "on_payment":
    case "on_payment_subscription_signup":
    case "on_rebill_resumed":
      return "paid";
    case "on_refund":
      return "refunded";
    case "on_chargeback":
      return "chargeback";
    case "on_payment_missed":
      return "paused";
    case "last_paid_day":
    case "on_rebill_cancelled":
      return "cancelled";
    default:
      return null;
  }
}

// --- Event → Abo-Status ------------------------------------------------------

export type SubscriptionStatus = "active" | "paused" | "cancelled";

/**
 * Maps an IPN event to the subscription status (subscriptions.status).
 * Returns null for events that do not change the subscription status.
 * Refunds/chargebacks run through the order status, not the subscription
 * status.
 */
export function mapEventToSubscriptionStatus(
  event: string,
): SubscriptionStatus | null {
  switch (event) {
    case "on_payment":
    case "on_payment_subscription_signup":
    case "on_rebill_resumed":
      return "active";
    case "on_payment_missed":
      return "paused";
    case "on_rebill_cancelled":
    case "last_paid_day":
      return "cancelled";
    default:
      return null;
  }
}
