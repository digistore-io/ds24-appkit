// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// User management — database layer.
//
// Every writing function checks the rules from ./rules.ts FIRST and throws a
// UserError carrying a reason code if they refuse. The server actions
// (app/dashboard/admin/users/actions.ts) catch it and translate the code into
// the user's language.
//
// Note: these functions do NOT assume the caller is authorized — they check it
// themselves against the actor they are given. The actions still call
// requireOwner() on top of that (belt and braces).
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, count, asc } from "drizzle-orm";
import { requireActiveUser } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import {
  canCreateUser,
  canChangeRole,
  canDeleteUser,
  canDeleteOwnAccount,
  canBlockUser,
  canChangeEmail,
  canSendLoginLink,
  normalizeEmail,
  UserError,
  type Actor,
} from "./rules";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
  blockedAt: Date | null;
}

/** The columns the UI needs — in one place, not repeated in every query. */
const USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
  blockedAt: users.blockedAt,
} as const;

/** All users, oldest first. */
export async function listUsers(): Promise<UserRow[]> {
  return db.select(USER_COLUMNS).from(users).orderBy(asc(users.createdAt));
}

/** Number of admins — the basis for the "last admin" rule. */
export async function countOwners(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "owner"));
  return Number(row?.n ?? 0);
}

/** One user, or null. For checks where "does not exist" is a normal outcome. */
export async function findUser(id: string): Promise<UserRow | null> {
  const [row] = await db.select(USER_COLUMNS).from(users).where(eq(users.id, id));
  return row ?? null;
}

async function requireUser(id: string): Promise<UserRow> {
  const row = await findUser(id);
  if (!row) throw new UserError("userNotFound");
  return row;
}

/**
 * Creates a user (or updates the role if the email already exists). The user
 * then signs in the normal way, via a magic link.
 */
export async function createUser(
  actor: Actor,
  input: { email: unknown; role: Role; name?: string | null },
): Promise<UserRow> {
  const denial = canCreateUser(actor);
  if (denial) throw new UserError(denial);

  const email = normalizeEmail(input.email);
  if (!email) throw new UserError("invalidEmail");

  const [row] = await db
    .insert(users)
    .values({ email, role: input.role, name: input.name ?? null })
    .onConflictDoUpdate({
      target: users.email,
      set: { role: input.role },
    })
    .returning(USER_COLUMNS);
  return row;
}

/** Sets a user's role. */
export async function setUserRole(
  actor: Actor,
  targetId: string,
  newRole: Role,
): Promise<void> {
  const target = await requireUser(targetId);
  const denial = canChangeRole(actor, target, newRole, await countOwners());
  if (denial) throw new UserError(denial);
  if (target.role === newRole) return;
  await db.update(users).set({ role: newRole }).where(eq(users.id, targetId));
}

/**
 * Blocks a user (`blocked = true`) or lifts the block.
 *
 * Blocked means: no new sign-in (auth.ts) and the end of the running session
 * on the next page load (lib/users/blocked.ts). The account's data is kept —
 * that is what separates blocking from deleting.
 */
export async function setUserBlocked(
  actor: Actor,
  targetId: string,
  blocked: boolean,
): Promise<void> {
  const target = await requireUser(targetId);
  const denial = canBlockUser(actor, target, await countOwners(), blocked);
  if (denial) throw new UserError(denial);
  if (Boolean(target.blockedAt) === blocked) return;
  await db
    .update(users)
    .set({ blockedAt: blocked ? new Date() : null })
    .where(eq(users.id, targetId));

  // Blocking stops unattended card charges too.
  //
  // A blocked Member is redirected out of /dashboard by `requireActiveUser()`,
  // so the auto top-up off switch on their billing page becomes unreachable —
  // and the Operator has no control of their own. Leaving the account armed
  // would keep charging the card of somebody who has just been locked out, with
  // nobody able to stop it. The MANDATE is kept: blocking is reversible, and an
  // unblocked Member should not have to buy again to get back what they had.
  if (blocked) {
    const { disarmAutoReload } = await import("@/lib/tokens/account");
    await disarmAutoReload({ memberId: targetId }).catch((err) => {
      // Never fail the block over this — locking the account out is the more
      // important half and must not be undone by a token-table error.
      console.error("[users] could not disarm auto top-up on block:", err);
    });
  }
}

/**
 * Sets a user's email address.
 *
 * `emailVerified` is reset in the process: what had been verified was the OLD
 * address. The new one proves itself with the next sign-in link.
 *
 * Uniqueness is enforced by the unique index on `users.email` — which is why
 * this does not ask "does it already exist?" beforehand: between the question
 * and the write, a second admin could hand out the same address. The index
 * decides; the conflict is caught.
 */
export async function setUserEmail(
  actor: Actor,
  targetId: string,
  input: unknown,
): Promise<string> {
  const target = await requireUser(targetId);
  const denial = canChangeEmail(actor);
  if (denial) throw new UserError(denial);

  const email = normalizeEmail(input);
  if (!email) throw new UserError("invalidEmail");
  if (email === target.email) return email;

  try {
    await db
      .update(users)
      .set({ email, emailVerified: null })
      .where(eq(users.id, targetId));
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError("emailTaken");
    throw error;
  }
  return email;
}

/**
 * Checks whether an admin may send this user a sign-in link, and returns the
 * destination address. The sending itself happens in the server action — it
 * goes through Auth.js (signIn) so that exactly the same token mechanism
 * applies as for a normal sign-in.
 */
export async function loginLinkTarget(
  actor: Actor,
  targetId: string,
): Promise<string> {
  const target = await requireUser(targetId);
  const denial = canSendLoginLink(actor, target);
  if (denial) throw new UserError(denial);
  return target.email as string;
}

/**
 * Deletes a user. Sessions and accounts hang off it via ON DELETE CASCADE
 * (see db/schema.ts) and go with it.
 */
export async function deleteUser(actor: Actor, targetId: string): Promise<void> {
  const target = await requireUser(targetId);
  const denial = canDeleteUser(actor, target, await countOwners());
  if (denial) throw new UserError(denial);
  await db.delete(users).where(eq(users.id, targetId));
}

/**
 * Deletes the SIGNED-IN member's own account — the Art. 17 self-service path.
 *
 * ── It takes no id, and must never start taking one ───────────────────────
 * The account deleted is always the session's own, the same guarantee
 * `spendTokens()` gives. A Server Action is an HTTP endpoint of its own, so an
 * id arriving in a `FormData` would let anybody delete anybody — the most
 * destructive IDOR this app could have, and an irreversible one. That is also
 * why this does not simply call `deleteUser(actor, actorId)`: that function
 * refuses self-deletion by design, and "fixing" it to allow the case would
 * remove the guard that stops an Operator wiping themselves off their own user
 * list.
 *
 * ── What survives, and why the caller has to say so ───────────────────────
 * `db/schema*.ts` decides this, not this function. Going with the account
 * (`cascade`): sessions, OAuth links, chat transcripts, MCP keys, grants,
 * pending address changes, consent records, and the impersonation rows that
 * name this member. Staying with the member link set to `null`: `orders`,
 * `subscriptions`, `token_ledger`, `ai_usage` — accounting records that
 * § 147 AO and § 257 HGB require to be kept and that Art. 17(3)(b) exempts from
 * erasure while that obligation runs.
 *
 * **Deleting them on request would be the violation, not the remedy.** The
 * dialog has to name this before the button is pressed; a person who believed
 * "delete" meant "everything" was not informed.
 *
 * ── The one thing a cascade cannot do ─────────────────────────────────────
 * Uploaded files live in object storage, not in Postgres. A foreign key with
 * `on delete cascade` removes the ROW describing a file and leaves the file
 * itself sitting in the bucket for ever — at which point the app has told
 * somebody their data is gone while still holding it, and nothing left in the
 * database can find it to finish the job. So the objects are removed FIRST,
 * and a failure there stops the deletion rather than proceeding without them.
 */
export async function deleteOwnAccount(): Promise<void> {
  const session = await requireActiveUser();

  const actor: Actor = {
    id: session.user.id as string,
    role: session.user.role as string,
  };

  const denial = canDeleteOwnAccount(actor, await countOwners());
  if (denial) throw new UserError(denial);

  // Before the row goes. Imported here rather than at the top of the file so
  // that the media layer — and the environment reading it does — is only
  // touched by installations that reach this line.
  const { deleteOwnedMedia } = await import("@/lib/media/manage");
  await deleteOwnedMedia(actor.id);

  await db.delete(users).where(eq(users.id, actor.id));
}

/**
 * Does this error violate a unique index? Postgres reports that as SQLSTATE
 * 23505 — the code is stable, the error message is not (it depends on the
 * server's language).
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}
