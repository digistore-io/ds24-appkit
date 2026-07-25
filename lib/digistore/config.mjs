// The fixed facts about Digistore24 — the ones that are the same for every
// installation of this app.
//
// They live here, in code, and NOT in the `.env`. The `.env` is where the
// things belong that differ from machine to machine: your API key, your IPN
// passphrase, your app URL. An address that is identical for everybody is not
// configuration — putting it there only means every developer reads four more
// lines before finding the one value they actually have to fill in, and a typo
// in any of them breaks the connection in a way that looks like a Digistore24
// outage.
//
// `.mjs` on purpose: the app (TypeScript) and the setup scripts (plain Node)
// both read these values, and this way there is one copy rather than two that
// drift apart. Same deal as `lib/ai/providers/ids.mjs`.

/** API base of Digistore24. */
export const DIGISTORE_API_URL = "https://www.digistore24.com";

/**
 * The developer key this template ships with.
 *
 * A developer key carries no account permissions, it only identifies the
 * calling application — the role of an OAuth client ID. Not a secret, which is
 * why it sits openly in the code and is deliberately not obfuscated. The
 * permission-bearing API key only comes into being once the merchant approves
 * the access in the browser, and afterwards lives solely in that merchant's
 * local `.env`.
 */
export const DIGISTORE_DEVELOPER_KEY =
  "1706550-aASzoSnqcChueKmMDBvcwqUWvOqnfhXTncfkTN6X"; // gitleaks:allow trufflehog:ignore pragma: allowlist secret NOSONAR nosemgrep

/**
 * Permissions requested for the API key that `node run.mjs ds24-connect`
 * fetches. `writable` is the only value that works here: the app creates
 * products and generates checkout links, and both need write access.
 */
export const DIGISTORE_REQUESTED_PERMISSIONS = "writable";

/**
 * The public redirect page every localhost URL travels through — Digistore24
 * accepts public https addresses only. Reached ONLY while the app runs on
 * localhost; an app on its own domain hands out its own URLs directly
 * (`publicUrlFor()` in `public-url.ts`).
 *
 * The page behind it is a handful of static files; it never sees an API key or
 * any purchase data — all it does is send a browser onwards to a hard-wired
 * localhost.
 */
export const DIGISTORE_REDIR_URL = "https://ds24-appkit.com/redir/";
