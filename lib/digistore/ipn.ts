// Digistore24 IPN-Signaturprüfung — exakt nach dem offiziellen DS24-Beispiel
// (https://www.digistore24.com/download/ipn/examples/ipn/sha_sign.php).
//
// Algorithmus:
//   1. Parameter `sha_sign` und `SHASIGN` entfernen.
//   2. Keys in Großbuchstaben umwandeln und case-insensitiv (SORT_STRING) sortieren.
//   3. Leere Werte (undefined/null/"") überspringen.
//   4. Pro Parameter `KEY=VALUE` + Passphrase konkatenieren.
//   5. SHA512-Hash bilden, Ergebnis in Großbuchstaben.
//   6. Case-insensitiv (timing-safe) mit dem gelieferten `sha_sign` vergleichen.
import crypto from "crypto";

export type IpnParams = Record<string, string>;

/**
 * Berechnet die DS24-SHA-Signatur über die IPN-Parameter.
 * @param algorithm  Standard "sha512" (DS24-Default). SHA1/andere nur für Legacy.
 */
export function digistoreShaSign(
  params: IpnParams,
  passphrase: string,
  algorithm: string = "sha512",
): string {
  const prepared = Object.entries(params)
    .filter(([key]) => {
      const up = key.toUpperCase();
      return up !== "SHA_SIGN" && up !== "SHASIGN";
    })
    // Keys uppercasen (DS24-Default: convert_keys_to_uppercase = true).
    .map(([key, value]) => ({ key: key.toUpperCase(), value }))
    // SORT_STRING über die (bereits uppercased) Keys → case-insensitiv.
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
 * Prüft die IPN-Signatur. Fail-closed: ohne Passphrase oder ohne `sha_sign`
 * schlägt die Prüfung fehl.
 */
export function verifyIpnSignature(
  params: IpnParams,
  passphrase: string,
  algorithm: string = "sha512",
): boolean {
  const received = params["sha_sign"] ?? params["SHASIGN"];
  if (!received || !passphrase) return false;

  const expected = digistoreShaSign(params, passphrase, algorithm);
  const a = Buffer.from(received.toUpperCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Event → Order-Status ----------------------------------------------------

export type OrderStatus =
  | "paid"
  | "refunded"
  | "chargeback"
  | "paused"
  | "cancelled";

/**
 * Bildet ein DS24-IPN-Event auf einen Order-Status ab.
 * Gibt null zurück für Events, die keinen Statuswechsel auslösen
 * (z. B. connection_test, reine Info-Events).
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
 * Bildet ein IPN-Event auf den Abo-Status (subscriptions.status) ab.
 * Gibt null für Events zurück, die den Abo-Status nicht ändern.
 * Refund/Chargeback laufen über den Order-Status, nicht über den Abo-Status.
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
