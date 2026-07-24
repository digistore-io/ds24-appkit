// The operator's Digistore24 credentials.
//
// Single-operator model: this app bills through exactly ONE Digistore24
// account. The credentials therefore live in the environment and not in the
// database — fetched and written into `.env` by `node run.mjs ds24-connect`
// (scripts/ds24/connect-api-key.mjs).
//
// There is deliberately no UI for entering keys: an input field for a secret
// is additional attack surface, and the key belongs to the operator of the
// installation, not to a signed-in user.
//
// This module reads only the environment — no database. Billing rows are no
// longer namespaced by an operator id (one installation, one Digistore24
// account), so there is nothing here to resolve against the users table.

/**
 * Read/write API key for the Digistore24 REST API.
 * Throws when unset — no silent fallback (see CLAUDE.md).
 */
export function ds24ApiKey(): string {
  const key = process.env.DIGISTORE_API_KEY;
  if (!key) {
    throw new Error(
      "DIGISTORE_API_KEY fehlt. Verbindung herstellen mit: node run.mjs ds24-connect",
    );
  }
  return key;
}

/**
 * Is an API key configured at all?
 *
 * Meant for the UI ("Digistore24 is not connected yet") — there, a missing key
 * should produce a notice and not an error. Everywhere that actually talks to
 * the API, `ds24ApiKey()` still applies, which deliberately throws.
 */
export function hasDigistoreApiKey(): boolean {
  return Boolean(process.env.DIGISTORE_API_KEY);
}

/**
 * Passphrase for the SHA512 check on incoming IPN calls.
 * Returns null when unset — the IPN endpoint then refuses (fail closed)
 * instead of processing unverified events.
 */
export function ds24IpnPassphrase(): string | null {
  return process.env.DIGISTORE_IPN_PASSPHRASE || null;
}

