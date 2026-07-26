// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What an impersonation looks like inside the session token.
//
// PURE, and free of the database and of `auth.ts` on purpose: `auth.config.ts`
// imports it, and that file sits in front of every matched request and stays
// free of both (see its header). Everything here is reading and shaping a value
// that is already inside a signed token.
//
// ── Why the identity rides in the token at all ─────────────────────────────
// Sessions are JWTs (`auth.config.ts` → `strategy: "jwt"`). There is no session
// row to swap, so the member becomes the token's subject and the Operator's own
// identity travels beside it as a claim. One token, one lifetime — where two
// cookies would give two, plus a reachable state in which one exists without
// the other.
//
// ── Why the token is trustworthy and the update payload is not ─────────────
// This claim is written by `lib/impersonation/session.ts` inside the `jwt`
// callback and signed by Auth.js. Whatever is in here, we put there. That is
// emphatically NOT true of the data that ARRIVES at that callback on an update
// trigger: `/api/auth/session` accepts a POST from any signed-in user. The
// distinction is the whole security model of this feature — see the header of
// `db/schema-impersonation.ts`.
import { impersonationExpired } from "@/lib/users/rules";

/** The key the claim lives under, inside the JWT. */
export const IMPERSONATION_CLAIM = "imp" as const;

export interface ImpersonationClaim {
  /** The record row. Also the thing that authorised this session to exist. */
  id: string;
  /** Who is really at the keyboard. */
  operatorId: string;
  operatorEmail: string | null;
  /** Their real role, so stepping out restores what they actually had. */
  operatorRole: string;
  /** Whose account is being acted in — for the banner, without a query. */
  memberEmail: string | null;
  /** Epoch milliseconds. Stored, not recomputed, so the cap cannot drift. */
  expiresAt: number;
}

/** Is this shape actually a claim? Written by us, but read after a decode. */
export function readClaim(token: unknown): ImpersonationClaim | null {
  if (!token || typeof token !== "object") return null;
  const raw = (token as Record<string, unknown>)[IMPERSONATION_CLAIM];
  if (!raw || typeof raw !== "object") return null;

  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || c.id === "") return null;
  if (typeof c.operatorId !== "string" || c.operatorId === "") return null;
  if (typeof c.operatorRole !== "string" || c.operatorRole === "") return null;
  if (typeof c.expiresAt !== "number" || !Number.isFinite(c.expiresAt)) return null;

  return {
    id: c.id,
    operatorId: c.operatorId,
    operatorEmail: typeof c.operatorEmail === "string" ? c.operatorEmail : null,
    operatorRole: c.operatorRole,
    memberEmail: typeof c.memberEmail === "string" ? c.memberEmail : null,
    expiresAt: c.expiresAt,
  };
}

/**
 * What the app should be told about the current session.
 *
 * Three states, and the middle one is the one people forget:
 *
 *   "none"     — an ordinary session.
 *   "running"  — an impersonation inside its thirty minutes. The app answers as
 *                the member, and the banner is on every page.
 *   "expired"  — the cap has passed. The app answers as the OPERATOR again,
 *                and it says so once.
 *
 * The expired state is resolved here, on every read, rather than by rewriting
 * the token when the clock passes. Next.js forbids setting a cookie during a
 * server-component render, so there is no moment during a page load at which a
 * rewrite could happen — and a stale token is harmless as long as every reader
 * honours the expiry, which is what this function makes unavoidable. The record
 * row is closed by the scheduled job (`lib/cron/jobs.ts`); that is the case it
 * exists for.
 */
export type ImpersonationState =
  | { kind: "none" }
  | { kind: "running"; claim: ImpersonationClaim }
  | { kind: "expired"; claim: ImpersonationClaim };

export function impersonationState(
  token: unknown,
  now: number = Date.now(),
): ImpersonationState {
  const claim = readClaim(token);
  if (!claim) return { kind: "none" };
  if (impersonationExpired(claim.expiresAt, now)) return { kind: "expired", claim };
  return { kind: "running", claim };
}

/** What the banner needs. Carried on the session so no page has to query. */
export interface SessionImpersonation {
  /**
   * The record row.
   *
   * Safe to carry here, and worth saying why rather than leaving a reader to
   * wonder: knowing this id grants nothing. The only thing that consumes it is
   * the auth callback, and it refuses any row whose `operatorId` is not already
   * the caller's own — so the one person an id is useful to is the person who
   * already has it. What it buys is the sign-out path being able to close the
   * record it is ending, instead of leaving a session showing as running for up
   * to half an hour after somebody left.
   */
  id: string;
  operatorEmail: string | null;
  memberEmail: string | null;
  expiresAt: number;
}
