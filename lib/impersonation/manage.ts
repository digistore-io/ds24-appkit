// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The database side of signing in as a user.
//
// The pure rules are in `lib/users/rules.ts` (`canImpersonate`,
// `canStopImpersonating`, `impersonationExpired`) next to the other user rules,
// and this file calls them before it writes — the same split every other domain
// module here uses.
//
// ⚠️ `openImpersonation()` is the authorisation step, not merely the audit
// step. Read the header of `db/schema-impersonation.ts` before changing the
// order of anything in it.
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { impersonations, users } from "@/db/schema";
import type { ImpersonationEndReason } from "@/db/schema-impersonation";
import { IMPERSONATION_MINUTES } from "@/lib/users/rules";

/** The row as the auth callback needs to see it, to decide whether to trust it. */
export interface OpenImpersonation {
  id: string;
  operatorId: string | null;
  memberId: string;
  startedAt: Date;
  expiresAt: Date;
}

/**
 * Start the record, and with it the impersonation.
 *
 * Returns the row. Its id is the proof the auth callback will demand — see
 * `lib/impersonation/session.ts`. Nothing here checks whether the impersonation
 * is allowed: the caller does that with `canImpersonate()` before it gets here,
 * exactly as `setUserBlocked()` expects `canBlockUser()` to have run.
 */
export async function openImpersonation(input: {
  operatorId: string;
  memberId: string;
}): Promise<OpenImpersonation> {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + IMPERSONATION_MINUTES * 60_000);

  const [row] = await db
    .insert(impersonations)
    .values({
      operatorId: input.operatorId,
      memberId: input.memberId,
      startedAt,
      expiresAt,
    })
    .returning({
      id: impersonations.id,
      operatorId: impersonations.operatorId,
      memberId: impersonations.memberId,
      startedAt: impersonations.startedAt,
      expiresAt: impersonations.expiresAt,
    });

  return row;
}

/**
 * The record with this id, if it is still usable, or null.
 *
 * "Still usable" means two things, and both are part of the question on
 * purpose:
 *
 *  - **Not closed.** Otherwise an Operator who stepped out could step straight
 *    back in by replaying the same id, and the record would show one session
 *    where there were two.
 *  - **Not past its deadline.** A row whose thirty minutes have already gone by
 *    — the scheduled closer runs every five minutes, so such rows exist — would
 *    otherwise be claimable and produce a session that every reader immediately
 *    treats as expired. Harmless, and baffling: the Operator clicks, the page
 *    reloads, and nothing appears to have happened.
 */
export async function findOpenImpersonation(
  id: string,
): Promise<OpenImpersonation | null> {
  if (!id) return null;
  const [row] = await db
    .select({
      id: impersonations.id,
      operatorId: impersonations.operatorId,
      memberId: impersonations.memberId,
      startedAt: impersonations.startedAt,
      expiresAt: impersonations.expiresAt,
    })
    .from(impersonations)
    .where(
      and(
        eq(impersonations.id, id),
        isNull(impersonations.endedAt),
        gt(impersonations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Close a record.
 *
 * Conditional on it still being open, so calling it twice is harmless and the
 * first ending wins — the Operator pressing the button a moment before the cap
 * passes must not be overwritten by "expired".
 */
export async function closeImpersonation(
  id: string,
  reason: ImpersonationEndReason,
): Promise<void> {
  if (!id) return;
  await db
    .update(impersonations)
    .set({ endedAt: new Date(), endedBy: reason })
    .where(and(eq(impersonations.id, id), isNull(impersonations.endedAt)));
}

/**
 * Close every record whose cap has passed and which nobody closed.
 *
 * The one ending no request can notice: the tab was closed, so nothing ever
 * comes back to observe the expiry. Idempotent by construction — the `WHERE`
 * excludes rows that already have an end — which is what `docs/cron.md`
 * requires of a job that may run twice.
 *
 * Returns how many it closed, for the job's one line of numbers.
 */
export async function closeAbandonedImpersonations(): Promise<number> {
  const now = new Date();
  const closed = await db
    .update(impersonations)
    .set({ endedAt: now, endedBy: "abandoned" })
    .where(
      and(isNull(impersonations.endedAt), lt(impersonations.expiresAt, now)),
    )
    .returning({ id: impersonations.id });
  return closed.length;
}

/** Delete records older than `months`. Returns how many went. */
export async function pruneImpersonations(months: number): Promise<number> {
  // A retention window is a number a person edits, and `Number(null)` is 0 —
  // zero months of retention means "delete everything". The caller reads it
  // with `configuredNumber()`; this is the second line of defence.
  if (!Number.isFinite(months) || months < 1) return 0;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const gone = await db
    .delete(impersonations)
    .where(lt(impersonations.startedAt, cutoff))
    .returning({ id: impersonations.id });
  return gone.length;
}

/** One line of the record page. */
export interface ImpersonationRecord {
  id: string;
  operatorEmail: string | null;
  memberEmail: string | null;
  memberId: string;
  startedAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

/**
 * The record, newest first, for `/dashboard/admin/impersonations`.
 *
 * Both joins are aliased self-joins on `users` — the Operator and the member
 * are rows in the same table — and both are LEFT joins because
 * `impersonations.operatorId` is `set null` on delete.
 *
 * Every column selected here is a real column, so Drizzle's own mappers convert
 * the timestamps. No `sql<Date>` anywhere: a raw expression has no mapper, the
 * driver's string would arrive wearing a `Date`'s type, and the page would
 * render a Postgres timestamp verbatim with a clean 200. `db/sql-cast.test.ts`
 * exists because that has already happened once.
 */
export async function listImpersonations(
  limit = 200,
): Promise<ImpersonationRecord[]> {
  const op = alias(users, "operator_user");
  const mem = alias(users, "member_user");

  return db
    .select({
      id: impersonations.id,
      operatorEmail: op.email,
      memberEmail: mem.email,
      memberId: impersonations.memberId,
      startedAt: impersonations.startedAt,
      endedAt: impersonations.endedAt,
      endedBy: impersonations.endedBy,
    })
    .from(impersonations)
    .leftJoin(op, eq(op.id, impersonations.operatorId))
    .leftJoin(mem, eq(mem.id, impersonations.memberId))
    .orderBy(desc(impersonations.startedAt))
    .limit(limit);
}

/** One line of a member's subject access request. */
export interface ImpersonationOfMember {
  id: string;
  operatorEmail: string | null;
  startedAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

/**
 * Every time somebody signed in as this member — for their subject access
 * request (`node run.mjs data-export`).
 *
 * The Operator's address is included deliberately. The member is entitled to
 * know WHO accessed their account, and "an administrator" is not an answer in a
 * business that has more than one.
 */
export async function listImpersonationsFor(
  memberId: string,
): Promise<ImpersonationOfMember[]> {
  const op = alias(users, "operator_user");

  return db
    .select({
      id: impersonations.id,
      operatorEmail: op.email,
      startedAt: impersonations.startedAt,
      endedAt: impersonations.endedAt,
      endedBy: impersonations.endedBy,
    })
    .from(impersonations)
    .leftJoin(op, eq(op.id, impersonations.operatorId))
    .where(eq(impersonations.memberId, memberId))
    .orderBy(desc(impersonations.startedAt));
}
