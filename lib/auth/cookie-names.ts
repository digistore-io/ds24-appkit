// Custom cookie names for local development.
//
// The problem: cookies know nothing about ports. If a second app from this
// template runs on the same machine — one on localhost:3000, the other on
// localhost:3001 — both share the browser's cookie store. Each then gets to
// see the other's session cookie and cannot decrypt it with its own
// AUTH_SECRET. The terminal then says:
//
//   [auth][error] JWTSessionError
//   [auth][cause]: Error: no matching decryption secret
//
// The same happens when a fresh copy of the template lands in the same folder:
// new app, new AUTH_SECRET, but the old cookie is still in the browser.
//
// The fix: in DEV the cookie names carry a fingerprint derived from
// AUTH_SECRET. Different installations therefore get different names and stay
// out of each other's way; after a change of secret the old cookie is simply
// ignored instead of raising an error.
//
// DEV only: in STAGING/PROD the app runs on its own domain, where the problem
// does not exist — and there the Auth.js defaults stay untouched (including
// the `__Secure-`/`__Host-` prefixes, which must not be tampered with).
import { appEnv } from "@/lib/env-guard";

export interface CookieEnv {
  APP_ENV?: string;
  APP_URL?: string;
  AUTH_SECRET?: string;
}

/** true if the URL points at this machine (same as lib/auth/dev-login.ts). */
function isLocalUrl(appUrl?: string): boolean {
  if (!appUrl) return true; // not set = local development
  try {
    const host = new URL(appUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * A short fingerprint of AUTH_SECRET (FNV-1a, 32 bit).
 *
 * Deliberately not a crypto function: the auth config needs this value
 * synchronously at module load, and `crypto.subtle` is async only. The
 * fingerprint is not a secret and does not need to be one: it distinguishes
 * installations, it protects nothing. A 256-bit secret cannot be recovered
 * from a 32-bit hash.
 */
export function installationFingerprint(secret?: string): string {
  let hash = 0x811c9dc5;
  const value = secret ?? "";
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Should custom cookie names be used? Only in DEV and only locally.
 *
 * An allowlist, as with the development login: anything not clearly
 * recognizable as development counts as production and gets the Auth.js
 * defaults.
 */
export function shouldUseOwnCookieNames(env: CookieEnv): boolean {
  if (appEnv(env.APP_ENV) !== "development") return false;
  if (!isLocalUrl(env.APP_URL)) return false;
  return Boolean(env.AUTH_SECRET);
}

/**
 * Cookie configuration for Auth.js — undefined outside of DEV.
 *
 * The options match the Auth.js defaults for http (no `secure`, no
 * `__Secure-` prefix): in DEV the app runs over http://localhost.
 */
export function devCookies(env: CookieEnv) {
  if (!shouldUseOwnCookieNames(env)) return undefined;
  const fingerprint = installationFingerprint(env.AUTH_SECRET);
  const options = { httpOnly: true, sameSite: "lax", path: "/", secure: false } as const;
  return {
    sessionToken: { name: `authjs.session-token.${fingerprint}`, options },
    callbackUrl: { name: `authjs.callback-url.${fingerprint}`, options },
    csrfToken: {
      name: `authjs.csrf-token.${fingerprint}`,
      options: { ...options, httpOnly: true },
    },
  };
}
