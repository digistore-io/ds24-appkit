// The detour every localhost URL has to take before Digistore24 will accept it.
//
// Digistore24 rejects anything that is not public https — the return address of
// the connection assistant, the thank-you page of a product, all of it:
//
//   DS24 API error (updateProduct): Please only use secure URLs with https://.
//
// During local development that is exactly where everything lives, though: the
// app on http://localhost:3000, the assistant's listener on a short-lived port.
// So the URL handed over is not the local one but a public redirect address,
// and the browser is sent back to the local machine from there:
//
//   http://localhost:3000/optin/[ORDER_ID]
//     → https://ds24-appkit.com/redir/?port=3000&path=/optin/[ORDER_ID]
//     → (302) http://localhost:3000/optin/[ORDER_ID]
//
// The page behind it is a handful of static files (web-site/ in the template
// source repo); it never sees an API key or any purchase data — all it does is
// send a browser onwards to a hard-wired localhost.
//
// This ONLY works for URLs a browser follows. A URL that Digistore24 calls
// itself — the IPN endpoint above all — gets nothing out of it: the redirect
// would point at the Digistore24 server's own localhost. Those need a genuinely
// public address (`node run.mjs ds24-tunnel`), which is why scripts/ds24/ipn-setup.mjs skips
// the IPN locally instead of routing it through here.
//
// The app-side twin of this file is lib/digistore/public-url.ts — same rules,
// for the checkout links generated at runtime. Change one, change the other.

/** The redirect page that ships with the template. */
export const DEFAULT_REDIR_URL = "https://ds24-appkit.com/redir/";

// http://localhost and http://127.0.0.1 are the same machine; ::1 is its IPv6
// spelling and 0.0.0.0 is what a server that listens everywhere prints.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

const DEFAULT_PORTS = { "http:": "80", "https:": "443" };

function parse(url) {
  if (!url) return null;
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
}

/**
 * The public redirect endpoint, always with a trailing slash.
 * @param {Record<string, string | undefined>} [env]
 */
export function redirUrl(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const configured = (env.DIGISTORE_REDIR_URL || DEFAULT_REDIR_URL).trim();
  return `${configured.replace(/\/+$/, "")}/`;
}

/**
 * Is this an address that exists only on the machine running this script?
 *
 * https is deliberately NOT local here even on localhost: such a URL fails on
 * the certificate, not on reachability, and rerouting it would be the wrong
 * repair. Unreadable input is not local either — there is nothing to rewrite.
 */
export function isLocalhostUrl(url) {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== "http:") return false;
  return LOCAL_HOSTS.has(parsed.hostname);
}

/**
 * A URL as Digistore24 will take it: localhost becomes the public redirect,
 * everything else is passed through unchanged.
 *
 * The path travels raw, not percent-encoded — Digistore24 placeholders such as
 * `[ORDER_ID]` have to survive, and the redirect page reads the value as it
 * stands. The one thing that cannot be carried is a second query parameter: the
 * "&" in front of it is the separator of the redirect URL itself, so the path
 * would be cut off there. Such a URL is left alone on purpose — a clear error
 * from Digistore24 beats a redirect that silently drops half the address.
 */
export function publicUrlFor(url, redir = redirUrl()) {
  if (!url) return undefined;
  if (!isLocalhostUrl(url)) return url;

  const parsed = parse(url);
  const port = parsed.port || DEFAULT_PORTS[parsed.protocol];
  const path = `${parsed.pathname}${parsed.search}`;
  if (path.includes("&")) return url;

  return `${redir}?port=${port}&path=${path}`;
}
