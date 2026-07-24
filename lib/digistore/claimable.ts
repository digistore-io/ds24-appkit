// May a purchase in this order status still be claimed?
//
// Pure, and separate from claim.ts, for the reason rules.ts:5-9 already gives
// about the grant lifecycle: a money rule that lives only in a SQL `where` is
// a rule nothing asserts. This one lived in FOUR `where` clauses, and the only
// thing catching a mistake was a harness under `.dev/` — which is gitignored,
// never runs in CI, and is not even part of the template the customer
// receives. Every mutation of the widened filter passed `node run.mjs test` clean.
import type { orderStatusEnum } from "@/db/schema";

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/**
 * `paid` alone was wrong once entitlements existed. A cancelled subscription
 * carries `orders.status = 'cancelled'` WHILE ACCESS LEGITIMATELY CONTINUES to
 * the end of the paid period — story 2.3's whole point — and a missed payment
 * carries `paused`, which is reversible. Neither is a dead order: filtered to
 * `paid`, a buyer who purchased anonymously and cancelled before ever signing
 * up could claim what they paid for by NO route at all, neither the automatic
 * sign-in claim nor the Operator's manual attach.
 *
 * `refunded` and `chargeback` are excluded and must stay excluded: the money
 * went back. Story 2.2's terminal-`endedAt` guard is a SECOND line of defence
 * against claiming one, not the first — it cannot even fire for an anonymous
 * purchase refunded before anybody signed in, because there is no grant row
 * whose `endedAt` could be read.
 *
 * The switch is exhaustive ON PURPOSE. A new status added to the enum must be
 * decided here deliberately; it must not fall into a default and quietly
 * become claimable — or quietly stop being.
 */
export function isClaimable(status: OrderStatus): boolean {
  switch (status) {
    case "paid":
    case "cancelled":
    case "paused":
      return true;
    case "refunded":
    case "chargeback":
      return false;
  }
}

/** The same rule as a value, for the SQL `inArray(...)` filters. */
export const CLAIMABLE_STATUSES = [
  "paid",
  "cancelled",
  "paused",
] as const satisfies readonly OrderStatus[];

/**
 * Statuses a purchase GRANT may be created from.
 *
 * Narrower than `CLAIMABLE_STATUSES`, and deliberately so — `paused` is
 * missing. A subscription in payment default is claimable (the order should be
 * attributed, and the Operator should see it) but must not hand out a LIVE
 * entitlement on sign-in. Story 2.4 makes `on_payment_missed` suspend a grant;
 * without this narrowing, signing in would become a way to launder that
 * suspension away — `chooseGrantTransition({event: "on_payment"})` answers
 * `activate`, and there is no second chance, because Digistore24 does not
 * redeliver an event it already acknowledged.
 *
 * Story 2.3 §D4 prescribed the wider set for every pass. It was written before
 * 2.4 existed; this is the narrowing that keeps the two stories compatible.
 */
export const GRANTABLE_STATUSES = [
  "paid",
  "cancelled",
] as const satisfies readonly OrderStatus[];
