// The keys an AI client uses to reach this app's MCP server.
//
// One row per key a Member issued to themselves on `/dashboard/account`. The
// key travels in an `Authorization: Bearer …` header from Claude Code, Claude
// Desktop, claude.ai or any other MCP client — see `docs/mcp.md`.
//
// ── Why the secret is not in this table ────────────────────────────────────
// `tokenHash` is a SHA-256 of the key, and the key itself is shown exactly
// once, in the dialog that created it. Nothing in this app can read it back —
// not the Operator's user page, not `node run.mjs data-export`, not a log line.
// A key is a credential that acts with its owner's rights; an Operator who can
// read one can act as that customer.
//
// The hash is SHA-256 rather than the scrypt of `lib/credentials/hash.ts`, and
// that difference is deliberate rather than an inconsistency:
//
//   a password  — chosen by a human, low entropy, guessable. A memory-hard KDF
//                 is what makes guessing expensive. 16 MB per check is fine
//                 because it happens once per sign-in.
//   an MCP key  — 32 random bytes this app generated. There is no dictionary
//                 to run against it and nothing to slow an attacker down that
//                 the entropy has not already stopped. Meanwhile it is checked
//                 on EVERY tool call, and 16 MB of RAM per call is a denial of
//                 service somebody else pays for.
//
// ── Why the row survives revocation ────────────────────────────────────────
// Revoking sets `revokedAt` and keeps the row. A deleted key leaves the Member
// with no record that it ever existed, and "which of my keys did I revoke, and
// when" is exactly the question somebody asks after they revoke one in a hurry.
// `lib/mcp/rules.ts` → `keyState()` is what turns these three timestamps into
// live / expired / revoked.
import { pgTable, text, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./schema";

/**
 * What a key may do.
 *
 * Two values, not a permission system. The point of the split is the one thing
 * that actually goes wrong with a key pasted into an AI client: the client is
 * driven by a model reading text somebody else may have written, so a key that
 * can only read cannot be talked into spending, deleting or ordering anything.
 * `read` is the default in the UI for that reason.
 *
 * Enforced in `app/api/mcp/route.ts` against `readOnly` on each tool
 * (`lib/mcp/tools.ts`), never in the client and never merely by which tools are
 * listed — `tools/list` hiding a tool is cosmetics, the refusal has to be in
 * the call.
 */
export const mcpScopeEnum = pgEnum("mcp_scope", ["read", "write"]);

export const mcpKeys = pgTable(
  "mcp_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Whose key it is, and whose rights it carries. `cascade`, like the chat
    // transcripts and unlike the billing tables: a key belonging to a deleted
    // account is not a record of anything, it is a credential nobody may use.
    memberId: text("member_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // What the Member called it ("Claude on my laptop"). Theirs to write, so it
    // is personal data and it is in docs/data-protection.md.
    name: text("name").notNull(),
    // SHA-256 of the whole key, hex. UNIQUE so a lookup is one index probe —
    // the request path must not scan a table per tool call.
    tokenHash: text("token_hash").notNull().unique(),
    // The first characters of the key, in clear. Purely so the list on the
    // account page can say WHICH key a row is ("ds24mcp_a3F…") without being
    // able to show the key. Not a secret and not enough to be one.
    prefix: text("prefix").notNull(),
    scope: mcpScopeEnum("scope").notNull().default("read"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Last successful authentication. Written at most once a minute (see
    // lib/mcp/keys.ts) — an exact value would mean a write on every single tool
    // call, and "was this key used today" is the question it exists to answer.
    lastUsedAt: timestamp("last_used_at"),
    // When it stops working on its own, or NULL for "until somebody revokes
    // it". An expiry is offered because the common case — a key on a laptop
    // that gets replaced — is one nobody remembers to clean up.
    expiresAt: timestamp("expires_at"),
    // Revoked since. NULL means live. A timestamp rather than a flag for the
    // same reason `users.blockedAt` is one: the database then also records WHEN.
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [
    // Every read from the account page is "this member's keys, newest first".
    index("mcp_keys_member").on(t.memberId, t.createdAt),
  ],
);
