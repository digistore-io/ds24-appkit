// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The first account on a fresh installation becomes the owner.
//
// Why this exists: a working copy that has just been created (`make
// deploy-local` → `node run.mjs start`) has an EMPTY users table. Whoever signs in
// first — with any address, through the development login — would otherwise
// land as a "member": no admin area, no "Users" entry in the navigation, and
// no way to hand themselves the role, because that is exactly what the admin
// area is for. They would have to know `node run.mjs user-create` before they could
// even look at their own app.
//
// ============================================================================
// This is a bootstrap, NOT a rule of the app: it applies ONLY in the DEV
// environment. In STAGING and PROD the first person to sign in is not
// necessarily the operator — it may well be the first customer, and handing
// them user management would be an account takeover. There the operator
// creates their own account beforehand, deliberately:
//
//   node run.mjs user-create --email me@example.com --role owner --apply
//
// The environment check is the same allowlist used everywhere else (appEnv()
// in lib/env-guard.ts): anything not clearly recognized as development counts
// as production. A typo in APP_ENV therefore closes this door, it does not
// open it.
// ============================================================================
import { db } from "@/db";
import { users } from "@/db/schema";
import { count } from "drizzle-orm";
import { appEnv } from "@/lib/env-guard";
import type { Role } from "@/lib/roles";

/** true if a first account may be promoted to owner in this environment. */
export function isFirstUserOwnerAllowed(env: { APP_ENV?: string }): boolean {
  return appEnv(env.APP_ENV) === "development";
}

/**
 * The decision itself, as a pure function — it hands out user management, and
 * that is worth a test of its own (lib/users/bootstrap.test.ts).
 */
export function decideRoleForNewUser(input: {
  APP_ENV?: string;
  /** Does the users table already hold at least one row? */
  usersExist: boolean;
}): Role {
  if (!isFirstUserOwnerAllowed(input)) return "member";
  return input.usersExist ? "member" : "owner";
}

/** Does the app already have users? */
export async function usersExist(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0) > 0;
}

/**
 * The role an account that is being created RIGHT NOW gets — "member" as the
 * normal case, "owner" for the very first one on a fresh DEV installation.
 *
 * Called at creation time, not afterwards: the session is a JWT and carries
 * the role from the moment of sign-in (auth.config.ts → jwt callback). A
 * promotion applied after the fact would only take effect on the next sign-in
 * — the first look at the app would still be missing the admin area.
 *
 * Deliberately not serialized: two sign-ups in the same instant would both
 * read an empty table and both become owner. That cannot happen on one
 * developer's machine, and a write lock in front of every sign-up would be a
 * high price for it — two admins locally is not a security problem.
 */
export async function roleForNewUser(): Promise<Role> {
  return decideRoleForNewUser({
    APP_ENV: process.env.APP_ENV,
    // Only asked when the answer can still change anything — outside of DEV
    // the query would be a pointless round trip on every sign-up.
    usersExist: isFirstUserOwnerAllowed({ APP_ENV: process.env.APP_ENV })
      ? await usersExist()
      : true,
  });
}
