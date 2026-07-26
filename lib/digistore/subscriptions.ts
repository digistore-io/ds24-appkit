// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The Member's own view of their subscription mirror.
//
// Read-only, and DISPLAY ONLY. Nothing here decides what anybody may use —
// that is `lib/entitlements`, which reads `grants` and nothing else (AD-1).
// `subscriptions` is a mirror of what Digistore24 told us; two answers to "may
// this person use this" drift apart, one does not.
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { and, asc, eq, gte } from "drizzle-orm";

import { todayInUtc } from "./next-payment";

/**
 * The day the Member is next charged, or `null` when there is nothing honest to
 * show.
 *
 * Looked up by `memberId` — the column story 2.1 added and both claim paths
 * keep populated. Deliberately NO fallback to the session's email address: an
 * empty `member_id` means the purchase was never attributed, and the honest
 * render is no card at all. Story 1.7 gives the Operator the tool to fix it. An
 * email fallback here would quietly reintroduce the weak identity epic 1
 * removed, in the one place nobody would think to look for it.
 *
 * Three conditions, all of them subtractive:
 *
 *  - `status = 'active'` — the date is NULLed when the billing stops (§D3), so
 *    this is belt and braces; but a `paused` subscription is one whose charge
 *    has just failed, and naming a day for it is the same false promise in a
 *    different shape.
 *  - `next_payment_at >= today` (UTC) — a date that has slipped into the past
 *    means an event went missing, not that a charge is imminent. Comparing in
 *    SQL rather than after the fact means a single stale row cannot shadow the
 *    good one behind it. Today itself still counts: the day the money moves is
 *    the day the Member most wants to see it.
 *  - the soonest wins — the card answers "when am I next charged", and with
 *    several subscriptions running that is the earliest of them.
 *
 * The comparison is a `date >= date` in Postgres, no timestamp and no zone
 * anywhere near it (§D1).
 */
export async function nextPaymentForMember(
  memberId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const [row] = await db
    .select({ nextPaymentAt: subscriptions.nextPaymentAt })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.memberId, memberId),
        eq(subscriptions.status, "active"),
        gte(subscriptions.nextPaymentAt, todayInUtc(now)),
      ),
    )
    .orderBy(asc(subscriptions.nextPaymentAt))
    .limit(1);

  return row?.nextPaymentAt ?? null;
}
