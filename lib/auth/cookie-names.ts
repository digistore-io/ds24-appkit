// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

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
 * How long a DEV cookie lives — a week, against the Auth.js default of 30 days.
 *
 * The names above solve collisions between installations and create a slower
 * problem while doing it: every copy, and every regenerated AUTH_SECRET, leaves
 * a set of names behind that nothing ever removes. Cookies know nothing about
 * ports, so ALL of them are sent to EVERY app on localhost, and once the
 * `Cookie` header passes Node's 16 KB limit the request is answered with 431
 * before Next.js sees it. What the browser then shows is
 * "An unexpected response was received from the server." on the sign-in page —
 * in the one app that is not at fault, because it is the newest.
 *
 * A week is the compromise: a copy abandoned today stops being sent within
 * seven days instead of thirty, and somebody working on the app stays signed in
 * across a working week. It only shortens the COOKIE; the Auth.js session
 * maxAge is untouched, and outside DEV none of this applies (see below).
 *
 * The acute case — a jar that is already full — is `staleAuthCookieNames()`.
 */
const DEV_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * Above this many bytes of `authjs.*` cookies, foreign installations get
 * cleaned up. Below it, nothing is touched.
 *
 * The threshold is the whole reason two apps can be worked on side by side: at
 * 6 KB roughly eight installations fit, so the normal case — this app and one
 * other — never loses a session. It also leaves 10 KB of the 16 KB budget for
 * everything else, which matters because a Server Action request carries
 * `Next-Action` and `Next-Router-State-Tree` ON TOP of the cookies. That is why
 * the failure looks like a broken sign-in form: there is a window in which every
 * GET still works and only the action POST is over the line.
 */
export const PRUNE_ABOVE_BYTES = 6 * 1024;

/** The names this template hands out — `authjs.<kind>.<8 hex>`, nothing else. */
const OWN_SCHEME = /^authjs\.(session-token|callback-url|csrf-token)\.[0-9a-f]{8}$/;

/** What a cookie costs in the `Cookie` header: `name=value`, plus `; `. */
function headerCost(cookie: { name: string; value: string }): number {
  return cookie.name.length + cookie.value.length + 2;
}

/**
 * The cookies of OTHER installations of this template that should go — or an
 * empty list, which is the answer almost every time.
 *
 * Three rules, and each one is a decision rather than an implementation detail:
 *
 *  1. **Only our own species.** A plain `authjs.session-token` is spared: it may
 *     belong to some other Auth.js app on localhost that is not a copy of this
 *     template, and signing a stranger out is not this app's business. Only the
 *     fingerprinted names can be attributed with certainty.
 *  2. **Never our own.** The three names `devCookies()` produces are excluded by
 *     construction, not by the order in which the list is walked.
 *  3. **Only above PRUNE_ABOVE_BYTES.** Otherwise this would undo the reason the
 *     fingerprints exist — being signed into two local apps at once.
 *
 * Above the threshold every foreign fingerprint goes, and yes, that signs you
 * out of the other copy. That is the trade being made: one sign-in click against
 * every app on the machine refusing to work.
 *
 * Sorting by age would be kinder and is not possible: the value is an encrypted
 * JWE with no readable timestamp, and it belongs to an installation whose secret
 * we deliberately do not have.
 *
 * Pure, and DEV-only by the same allowlist as the names themselves — in
 * STAGING/PROD the app has its own domain and none of this exists.
 */
export function staleAuthCookieNames(
  cookies: { name: string; value: string }[],
  env: CookieEnv,
): string[] {
  const own = devCookies(env);
  if (!own) return [];

  const authjs = cookies.filter((cookie) => cookie.name.startsWith("authjs."));
  const total = authjs.reduce((bytes, cookie) => bytes + headerCost(cookie), 0);
  if (total <= PRUNE_ABOVE_BYTES) return [];

  const mine = new Set([own.sessionToken.name, own.callbackUrl.name, own.csrfToken.name]);
  return authjs
    .filter((cookie) => OWN_SCHEME.test(cookie.name) && !mine.has(cookie.name))
    .map((cookie) => cookie.name);
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
  const options = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: DEV_COOKIE_MAX_AGE,
  } as const;
  return {
    sessionToken: { name: `authjs.session-token.${fingerprint}`, options },
    callbackUrl: { name: `authjs.callback-url.${fingerprint}`, options },
    csrfToken: {
      name: `authjs.csrf-token.${fingerprint}`,
      options: { ...options, httpOnly: true },
    },
  };
}
