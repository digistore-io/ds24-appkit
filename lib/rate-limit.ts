// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Sliding-window rate limiting, for the two places in this app that need it.
//
// Both are things a stranger can trigger repeatedly and that cost somebody
// something:
//
//   password sign-in       — guesses against a secret (lib/credentials/)
//   change-address mails   — outbound mail to an address of the sender's
//                            choosing (lib/email-change/)
//
// A sliding window rather than a lockout with a fixed end. A lockout that
// outlives the attack also locks out the real owner, who is then left with a
// broken account and no idea why; here the window simply moves on.
//
// ⚠️ IN MEMORY, PER PROCESS — and worth knowing precisely rather than
// discovering later. The template ships as a single Node process, so one Map is
// the whole picture. Run several instances behind a load balancer and each
// keeps its own counts, which multiplies every limit below by the number of
// instances. That is a real limitation of the shape this template ships with,
// not an oversight: a shared store means Redis or a table on the sign-in path,
// and neither belongs in a template that promises no new runtime dependency.
// Revisit when the app is scaled out. Documented in docs/auth-setup.md.

export interface Limit {
  /** Hits tolerated inside the window before the next one is refused. */
  readonly max: number;
  readonly windowMs: number;
}

// --- The pure part -----------------------------------------------------------

/** The hits still inside the window, oldest first. */
export function withinWindow(
  timestamps: readonly number[],
  now: number,
  windowMs: number,
): number[] {
  const since = now - windowMs;
  return timestamps.filter((t) => t > since);
}

/** Has this key had enough hits to be refused the next one? */
export function isOverLimit(
  timestamps: readonly number[],
  now: number,
  limit: Limit,
): boolean {
  return withinWindow(timestamps, now, limit.windowMs).length >= limit.max;
}

// --- The stateful part -------------------------------------------------------

/** bucket → key → hit timestamps. */
const buckets = new Map<string, Map<string, number[]>>();

/** Keeps a long-running process from growing a Map without bound. */
const MAX_KEYS_PER_BUCKET = 10_000;

function bucketOf(bucket: string): Map<string, number[]> {
  let existing = buckets.get(bucket);
  if (!existing) {
    existing = new Map();
    buckets.set(bucket, existing);
  }
  return existing;
}

export function isLimited(
  bucket: string,
  key: string,
  limit: Limit,
  now: number = Date.now(),
): boolean {
  return isOverLimit(bucketOf(bucket).get(key) ?? [], now, limit);
}

export function record(
  bucket: string,
  key: string,
  limit: Limit,
  now: number = Date.now(),
): void {
  const store = bucketOf(bucket);
  const kept = withinWindow(store.get(key) ?? [], now, limit.windowMs);
  kept.push(now);
  store.set(key, kept);

  if (store.size > MAX_KEYS_PER_BUCKET) {
    for (const [k, timestamps] of store) {
      if (withinWindow(timestamps, now, limit.windowMs).length === 0) {
        store.delete(k);
      }
    }
  }
}

/** Forgets a key's history — e.g. after a sign-in that finally succeeded. */
export function clearKey(bucket: string, key: string): void {
  buckets.get(bucket)?.delete(key);
}

/** Test seam — drops every recorded hit in every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}
