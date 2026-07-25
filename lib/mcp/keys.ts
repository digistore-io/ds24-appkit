// Issuing, checking and revoking the keys an AI client authenticates with.
//
// The imperative shell around `lib/mcp/rules.ts`: this file owns the writes and
// the one query on the request path. Every decision it makes — is the shape
// right, is the key live, may this scope run this tool — is a pure function
// next door, so it can be tested without a database.
//
// ⚠️ NOTHING HERE MAY EVER RETURN A STORED KEY. `create()` returns the secret
// once, because it just generated it and the Member has to see it; every other
// function in this file returns rows without one. The table holds a SHA-256 and
// there is nothing to return — see `db/schema-mcp.ts` for why that hash and not
// scrypt.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, or, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { mcpKeys, users } from "@/db/schema";
import {
  KEY_BYTES,
  KEY_PREFIX,
  MAX_LIVE_KEYS,
  McpError,
  expiryFor,
  keyState,
  looksLikeKey,
  prefixOf,
  type KeyState,
  type LifetimeDays,
  type Scope,
} from "./rules";

/** SHA-256, hex. The one place a key becomes what the table stores. */
function hash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * A fresh key: the marker plus 32 random bytes as base64url.
 *
 * `randomBytes` and not `Math.random()`, obviously — but worth stating why
 * base64url specifically: the value is pasted into shell commands, JSON config
 * files and environment variables by people following a copy-paste
 * instruction, and base64url is the alphabet that survives all three without
 * quoting. Standard base64 would put `+` and `/` in a URL and a `=` at the end
 * of an env var.
 */
function mint(): string {
  return KEY_PREFIX + randomBytes(KEY_BYTES).toString("base64url");
}

// ── Creating ────────────────────────────────────────────────────────────────

export interface CreatedKey {
  id: string;
  name: string;
  scope: Scope;
  expiresAt: Date | null;
  /** The secret, IN CLEAR. Shown once and never obtainable again. */
  secret: string;
}

/**
 * Issues a key for one Member.
 *
 * The caller has already proved who that is — this function takes a `memberId`
 * because it is also what the Operator path would need, but there IS no
 * Operator path and there must not be one: an Operator who can mint a key can
 * act as the customer, which is the same line
 * `app/dashboard/admin/users/[id]` already refuses to cross for passwords.
 * The only caller is the Member's own Server Action.
 *
 * Throws `McpError("tooManyKeys")` at the limit. Revoked and expired keys do
 * not count, so replacing a key never hits it.
 */
export async function createKey(args: {
  memberId: string;
  name: string;
  scope: Scope;
  lifetimeDays: LifetimeDays;
}): Promise<CreatedKey> {
  const live = await countLiveKeys(args.memberId);
  if (live >= MAX_LIVE_KEYS) throw new McpError("tooManyKeys");

  const secret = mint();
  const expiresAt = expiryFor(args.lifetimeDays);

  const [row] = await db
    .insert(mcpKeys)
    .values({
      memberId: args.memberId,
      name: args.name,
      tokenHash: hash(secret),
      prefix: prefixOf(secret),
      scope: args.scope,
      expiresAt,
    })
    .returning({ id: mcpKeys.id });

  return { id: row.id, name: args.name, scope: args.scope, expiresAt, secret };
}

/** Live keys this member holds — the number `MAX_LIVE_KEYS` is measured against. */
export async function countLiveKeys(memberId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mcpKeys)
    .where(
      and(
        eq(mcpKeys.memberId, memberId),
        isNull(mcpKeys.revokedAt),
        // "no end date OR not yet reached". `now() at time zone 'utc'` and not
        // bare `now()`, for the same reason `lib/entitlements/manage.ts` spells
        // it out: `expires_at` is a `timestamp` WITHOUT time zone that MEANS
        // UTC, and comparing it to a `timestamptz` makes Postgres cast the left
        // side using a session time zone nothing in this project sets.
        or(isNull(mcpKeys.expiresAt), gt(mcpKeys.expiresAt, sql`(now() at time zone 'utc')`)),
      ),
    );
  return row?.n ?? 0;
}

// ── Listing and revoking ────────────────────────────────────────────────────

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scope: Scope;
  state: KeyState;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** This member's keys, newest first. Never carries a secret. */
export async function listKeys(memberId: string): Promise<KeyRow[]> {
  const rows = await db
    .select({
      id: mcpKeys.id,
      name: mcpKeys.name,
      prefix: mcpKeys.prefix,
      scope: mcpKeys.scope,
      createdAt: mcpKeys.createdAt,
      lastUsedAt: mcpKeys.lastUsedAt,
      expiresAt: mcpKeys.expiresAt,
      revokedAt: mcpKeys.revokedAt,
    })
    .from(mcpKeys)
    .where(eq(mcpKeys.memberId, memberId))
    .orderBy(desc(mcpKeys.createdAt));

  return rows.map((row) => ({ ...row, state: keyState(row) }));
}

/**
 * Revokes one key. Idempotent, and scoped to its owner.
 *
 * `memberId` is in the WHERE clause and not merely checked beforehand — that is
 * what makes this immune to an id from a form naming somebody else's key. A
 * Server Action is an HTTP endpoint of its own; the list only rendering the
 * caller's own keys protects nothing.
 *
 * Throws `McpError("unknownKey")` when nothing matched, which covers both "no
 * such key" and "not yours" with one answer — a caller has no business
 * learning which.
 */
export async function revokeKey(args: { memberId: string; keyId: string }): Promise<void> {
  const [row] = await db
    .update(mcpKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpKeys.id, args.keyId),
        eq(mcpKeys.memberId, args.memberId),
        isNull(mcpKeys.revokedAt),
      ),
    )
    .returning({ id: mcpKeys.id });

  if (!row) {
    // Already revoked is success, not an error — a second click must not
    // produce a red message about a key that is, in fact, revoked.
    const [existing] = await db
      .select({ id: mcpKeys.id })
      .from(mcpKeys)
      .where(and(eq(mcpKeys.id, args.keyId), eq(mcpKeys.memberId, args.memberId)))
      .limit(1);
    if (!existing) throw new McpError("unknownKey");
  }
}

// ── Authenticating a request ────────────────────────────────────────────────

/** Who is calling, and with what rights. */
export type Authenticated =
  | { ok: true; memberId: string; keyId: string; scope: Scope }
  | { ok: false; reason: "malformed" | "unknown" | "expired" | "revoked" | "blocked" };

/**
 * Turns a bearer value into a member, or says why not.
 *
 * ONE query, joined against `users`: the block check has to happen here because
 * there is no session to hang it off. `requireActiveUser()` covers the browser
 * path; this is the same two checks for a caller that never signs in. A blocked
 * account whose key still worked would be an account that is only blocked in
 * the browser.
 *
 * ⚠️ The caller must answer every `ok: false` the same way — 401, no detail.
 * The reasons exist for the server log, where they are the difference between
 * "somebody is guessing" and "a customer's key expired". Telling the caller
 * which turns this endpoint into an oracle for whether a key exists.
 */
export async function authenticate(bearer: string): Promise<Authenticated> {
  if (!looksLikeKey(bearer)) return { ok: false, reason: "malformed" };

  const [row] = await db
    .select({
      id: mcpKeys.id,
      memberId: mcpKeys.memberId,
      tokenHash: mcpKeys.tokenHash,
      scope: mcpKeys.scope,
      expiresAt: mcpKeys.expiresAt,
      revokedAt: mcpKeys.revokedAt,
      lastUsedAt: mcpKeys.lastUsedAt,
      blockedAt: users.blockedAt,
    })
    .from(mcpKeys)
    .innerJoin(users, eq(users.id, mcpKeys.memberId))
    .where(eq(mcpKeys.tokenHash, hash(bearer)))
    .limit(1);

  if (!row) return { ok: false, reason: "unknown" };

  // The lookup already matched on the hash, so this compares a value to
  // itself — and it is here on purpose. It costs nothing, and it means the day
  // somebody changes the lookup to fetch by `prefix` and compare afterwards
  // (the obvious "optimisation" when a prefix index gets added), the comparison
  // is already the constant-time one rather than a `===` that leaks.
  const expected = Buffer.from(row.tokenHash, "utf8");
  const actual = Buffer.from(hash(bearer), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "unknown" };
  }

  const state = keyState(row);
  if (state !== "live") return { ok: false, reason: state };
  if (row.blockedAt) return { ok: false, reason: "blocked" };

  await touch(row.id, row.lastUsedAt);

  return { ok: true, memberId: row.memberId, keyId: row.id, scope: row.scope };
}

/** Written at most once a minute — see `db/schema-mcp.ts`. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Records that a key was used, without turning every tool call into a write.
 *
 * A model fires tool calls in bursts; an exact `lastUsedAt` would mean an
 * UPDATE per call on a row every one of those calls also reads. The question
 * this column answers is "is this key still in use", and a minute's resolution
 * answers it.
 *
 * Failure is swallowed. A key that authenticated is a key that authenticated —
 * losing the bookkeeping must not turn a good call into a 500.
 */
async function touch(keyId: string, lastUsedAt: Date | null): Promise<void> {
  const now = Date.now();
  if (lastUsedAt && now - lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  try {
    await db.update(mcpKeys).set({ lastUsedAt: new Date(now) }).where(eq(mcpKeys.id, keyId));
  } catch (error) {
    console.error("[mcp] could not record key usage:", error);
  }
}
