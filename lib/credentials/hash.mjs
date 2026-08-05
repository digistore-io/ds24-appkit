// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Password hashing — the only implementation in this app that turns a password
// into something storable, and the only one that reads it back. `hash.ts` next
// door re-exports it for the TypeScript side; the two are one implementation,
// not two.
//
// It is `.mjs` — the same pattern as `lib/email-from.mjs` and
// `lib/cron/rules.mjs` — because two very different callers need the same
// hash: the sign-in path (`lib/credentials/manage.ts`, TS) and
// `scripts/users/smoke-account.mjs` (plain Node, provisioning the smoke
// account for a deployed app). A hash with two copies is security code that
// drifts; this one has one.
//
// scrypt from `node:crypto`, deliberately: it is a proper memory-hard key
// derivation function, it ships with Node, and it therefore adds NO runtime
// dependency (bcrypt and argon2 both would). It is also the same reasoning the
// rest of this template applies to `openssl` — whatever Node already does, Node
// does it.
//
// Stored format, one line, self-describing:
//
//   scrypt$16384$8$1$<salt base64>$<hash base64>
//
// The parameters travel WITH the hash rather than living in a constant. That is
// what makes them changeable later: raising the cost for new passwords leaves
// every existing one verifiable, because each row still says how it was made.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** CPU/memory cost. 16384 · 8 · 128 B ≈ 16 MB per hash. */
const N = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Node refuses a scrypt call whose parameters exceed `maxmem` (default 32 MB).
 * 16 MB fits, but only just — stating it explicitly means a later cost increase
 * fails in review rather than at runtime on the first sign-in.
 */
const MAX_MEM = 64 * 1024 * 1024;

const PREFIX = "scrypt";

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} n
 * @param {number} r
 * @param {number} p
 * @param {number} keyLength
 * @returns {Promise<Buffer>}
 */
function derive(password, salt, n, r, p, keyLength) {
  return new Promise((resolve, reject) => {
    scrypt(
      // Normalize to NFC so that a password typed on a Mac and the same one
      // typed on Windows produce the same bytes. Without this, an "ä" entered
      // as a combining sequence would not match one entered as a single code
      // point, and the user would be told their correct password is wrong.
      password.normalize("NFC"),
      salt,
      keyLength,
      { N: n, r, p, maxmem: MAX_MEM },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/**
 * Turns a password into the stored string. Never reversible.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(
    password,
    salt,
    N,
    BLOCK_SIZE,
    PARALLELIZATION,
    KEY_LENGTH,
  );
  return [
    PREFIX,
    N,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false for every kind of "no" — wrong password, no password set,
 * unreadable stored value — and takes roughly the same time in each case. That
 * matters: the sign-in path must not answer "does this account exist, and does
 * it have a password?" through how quickly it says no.
 *
 * @param {string} password
 * @param {string | null | undefined} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed) {
    // Nothing to compare against — but still spend the time, so that an
    // account without a password is indistinguishable from one with a wrong
    // password. The result is discarded.
    await derive(password, randomBytes(SALT_LENGTH), N, BLOCK_SIZE, PARALLELIZATION, KEY_LENGTH);
    return false;
  }

  const { salt, key, n, r, p } = parsed;
  let candidate;
  try {
    candidate = await derive(password, salt, n, r, p, key.length);
  } catch {
    // Parameters out of range for this Node build — treat as a failed check
    // rather than a crashed sign-in page.
    return false;
  }

  // Lengths are equal by construction (we derived `key.length` bytes), but
  // timingSafeEqual throws on a mismatch rather than returning false, and a
  // corrupt row must not become a 500.
  if (candidate.length !== key.length) return false;
  return timingSafeEqual(candidate, key);
}

/**
 * Reads the stored format back. Returns null for anything unexpected.
 *
 * @param {string | null | undefined} stored
 * @returns {{ n: number, r: number, p: number, salt: Buffer, key: Buffer } | null}
 */
function parse(stored) {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6) return null;
  const [prefix, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  if (prefix !== PREFIX) return null;

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  if (n <= 1 || r < 1 || p < 1) return null;

  const salt = Buffer.from(rawSalt, "base64");
  const key = Buffer.from(rawKey, "base64");
  if (salt.length === 0 || key.length === 0) return null;

  return { n, r, p, salt, key };
}
