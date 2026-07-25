// The detour every localhost URL has to take before Digistore24 will accept it.
//
// Digistore24 rejects anything that is not public https — the thank-you page of
// a checkout link just as much as a product's stored URL:
//
//   DS24 API error: Please only use secure URLs with https://.
//
// During local development the app lives at http://localhost:3000, so the URL
// handed over is not the local one but a public redirect address; the buyer's
// browser is sent back to the local machine from there:
//
//   http://localhost:3000/optin/[ORDER_ID]
//     → https://ds24-appkit.com/redir/?port=3000&path=/optin/[ORDER_ID]
//     → (302) http://localhost:3000/optin/[ORDER_ID]
//
// Only for URLs a BROWSER follows. The IPN endpoint is called by the Digistore24
// server itself and gets nothing out of this — that one needs a genuinely public
// address (`node run.mjs ds24-tunnel`).
//
// The script-side twin of this file is scripts/ds24/_public-url.mjs — same
// rules, for `node run.mjs ds24-sync`. Change one, change the other.
//
// The address itself is not a setting: it is the same for every installation
// and therefore lives in lib/digistore/config.mjs, not in the .env.
import { DIGISTORE_REDIR_URL } from "./config.mjs";

// http://localhost and http://127.0.0.1 are the same machine; ::1 is its IPv6
// spelling and 0.0.0.0 is what a server that listens everywhere prints.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Is this an address that exists only on the machine running the app?
 *
 * https is deliberately NOT local here even on localhost: such a URL fails on
 * the certificate, not on reachability, and rerouting it would be the wrong
 * repair. Unreadable input is not local either — there is nothing to rewrite.
 */
export function isLocalhostUrl(url: string | undefined): boolean {
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
export function publicUrlFor(
  url: string | undefined,
  redir: string = DIGISTORE_REDIR_URL,
): string | undefined {
  if (!url) return undefined;
  if (!isLocalhostUrl(url)) return url;

  const parsed = parse(url)!;
  const port = parsed.port || DEFAULT_PORTS[parsed.protocol];
  const path = `${parsed.pathname}${parsed.search}`;
  if (path.includes("&")) return url;

  return `${redir}?port=${port}&path=${path}`;
}
