// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The checkout token that corroborates a member id inside the Digistore24
// `tracking[custom]` value (lib/digistore/custom.ts).
//
// Handed out on the FIRST checkout rather than at sign-up. Five different code
// paths create users — the magic link, OAuth, the development login, the CLI
// and the seed — and a token minted at sign-up would be missing from whichever
// path is added next, silently, and only for new users. Generating it where it
// is first needed means every account gets one exactly when it matters.
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { newCheckoutToken } from "@/lib/digistore/custom";

/**
 * This Member's checkout token, creating one if they have none.
 *
 * Concurrent first checkouts race harmlessly: the update is conditional on the
 * column still being null, and whoever loses simply reads the winner's token.
 */
export async function ensureCheckoutToken(memberId: string): Promise<string> {
  const [existing] = await db
    .select({ checkoutToken: users.checkoutToken })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);

  if (existing?.checkoutToken) return existing.checkoutToken;

  const [won] = await db
    .update(users)
    .set({ checkoutToken: newCheckoutToken() })
    // Conditional on the column still being NULL — the docstring above has
    // always promised this and the predicate was missing.
    //
    // Without it, two concurrent first checkouts (a double-clicked buy button,
    // two tabs, a checkout racing autoReloadIfNeeded) both read null, both
    // mint, and the second OVERWRITES the first. The purchase created by the
    // loser then carries a `t:` pair that no longer matches the row, so its
    // IPN fails `findMemberByIdentity` and silently downgrades to the
    // unverified buyer-email path — which attributes to the wrong account or
    // to nobody. And the token is frozen on every purchase that Member ever
    // made: it comes back on every renewal and every refund, for years.
    .where(and(eq(users.id, memberId), isNull(users.checkoutToken)))
    .returning({ checkoutToken: users.checkoutToken });

  if (won?.checkoutToken) return won.checkoutToken;

  // Zero rows means "lost the race" OR "no such user". Re-read to tell them
  // apart — without this the race loser would be reported as a missing user.
  const [after] = await db
    .select({ checkoutToken: users.checkoutToken })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);
  if (after?.checkoutToken) return after.checkoutToken;
  throw new Error(`Cannot issue a checkout token: no user ${memberId}`);
}
