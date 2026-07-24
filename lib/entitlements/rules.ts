// What a Digistore24 event does to a Grant.
//
// PURE — no database, no I/O. The lookups happen in lib/entitlements/manage.ts
// and lib/digistore/payment-event.ts; their results are handed in here. Same
// split, and same reason, as lib/digistore/attribution.ts: this decision
// governs who may use what on the strength of a payment, so it has to be
// testable one case at a time (rules.test.ts). Nothing in this repo can test a
// DB-bound function — there is no test database. A rule that lives inside an
// `if` in the IPN handler is a rule nothing asserts.
//
// AD-2, and why the signature is the rule:
//
//   THERE IS NO `status` AND NO `subStatus` PARAMETER, AND THERE MUST NOT BE.
//
// `mapEventToStatus` and `mapEventToSubscriptionStatus` deliberately COLLAPSE
// events that mean opposite things to access: `on_rebill_cancelled` (billing
// stopped, access continues to the end of the paid period) and `last_paid_day`
// (access is over) both become "cancelled". Deriving a grant transition from
// that value takes back time the customer already paid for. The absence of the
// parameter is the guarantee, in a form a reviewer can check by reading one
// line — do not add one "for convenience".
//
// Story 2.1 laid the create path, story 2.2 added `end` (refund, chargeback)
// and the terminal-`endedAt` guard, story 2.3 split the cancellation in two —
// `on_rebill_cancelled` does nothing, `last_paid_day` ends. Story 2.4 added
// `suspend` and `resume`. Each story added cases to the switch rather than
// rewrite the call site.
//
// The event name is the ONLY payload field this function reads. An earlier
// version also branched on `billing_stop_reason`, on the theory that
// `on_payment_missed` had to be told apart from the cancellation it follows.
// That was wrong twice over: Digistore24's own guide recommends using the
// event to end access, and its worked example shows the event arriving AT or
// AFTER the end of the paid period, never before it. The field is not even in
// the guide's parameter table.

import type { ProductKind } from "@/lib/digistore/products";

/** Why nothing happened. Internal — never shown to a person. */
export type GrantNoopReason =
  /** A token package, or a product the registry cannot name. Balance, not
   *  entitlement (AC 6). */
  | "notAGrantProduct"
  /** The payment is not attributed to anybody yet (AD-3). It waits in `orders`
   *  and becomes a grant when the claim runs. */
  | "noMember"
  /** The grant is already closed, and closed is forever for this adapter
   *  (AD-2). Story 2.2 — see the guard below. */
  | "alreadyEnded"
  /** The buyer (or support) stopped the rebilling, and the paid period is
   *  still running. Story 2.3 — this is a DELIBERATE no-op, not an event we
   *  happen not to handle, and it is spelled differently from
   *  `irrelevantEvent` for that reason: the two look identical in the data and
   *  mean opposite things about whether anybody has thought about the case. */
  | "cancellationKeepsAccess"
  /** An event that does not touch entitlements at all. */
  | "irrelevantEvent"
  /** `on_rebill_resumed` for a purchase that has no grant. Resume LIFTS a
   *  suspension and does nothing else — it must never create one (AC 6, §D4).
   *  Distinct from `noMember`: somebody owns the payment, there is simply
   *  nothing to lift. */
  | "noGrant";

/**
 * Why a grant was closed. STORED (`grants.endedReason`), because nothing can
 * reconstruct it afterwards: "ended" alone cannot tell a refund from a normal
 * expiry, and those call for opposite support responses. `revoked` is Epic 3's
 * and is not produced here — the adapter never revokes by hand.
 */
export type GrantEndReason = "refund" | "chargeback" | "lastPaidDay";

export type GrantTransition =
  /** Create the grant if it is absent. (2.4 extends this to lifting a
   *  suspension; 2.1 only ever creates.) */
  | { kind: "activate" }
  /** Close it, for good. Refund and chargeback (2.2), and the end of the paid
   *  period after a cancellation (2.3). */
  | { kind: "end"; reason: GrantEndReason }
  /** Take access away REVERSIBLY — a genuinely failed payment (2.4). Sets
   *  `suspendedAt`, never `endedAt`: the customer whose card expired has not
   *  cancelled anything, and the grant must stay open so a resume can lift it
   *  (AC 4). */
  | { kind: "suspend" }
  /** Give it back — the payment succeeded, or support restarted the rebilling.
   *  Clears `suspendedAt` and NOTHING ELSE. It is not `activate`: it may never
   *  bring a grant into existence (AC 3, AC 6, §D4). */
  | { kind: "resume" }
  | { kind: "none"; why: GrantNoopReason };

export interface GrantTransitionInput {
  /**
   * The RAW Digistore24 event name — `on_payment`, `on_refund`,
   * `last_paid_day`. NEVER a mapped status (AD-2, see the header).
   */
  event: string;
  /** What was bought. `null` means the product could not be resolved. */
  productKind: ProductKind | null;
  /** Whom the payment belongs to, or null while unattributed. */
  memberId: string | null;
  /** The grant that already exists for this purchase and key, if any. */
  grant: { suspendedAt: Date | null; endedAt: Date | null } | null;
}


/**
 * The one decision point for the grant lifecycle.
 *
 * NEVER THROWS. An unknown event returns `none`, because an uncaught throw
 * here 500s the webhook and Digistore24 redelivers it forever — the same
 * reasoning `safeProduct()` in payment-event.ts already documents.
 */
export function chooseGrantTransition(
  input: GrantTransitionInput,
): GrantTransition {
  const { event, productKind, memberId, grant } = input;

  // Ordered guards, not a switch with conditions bolted on.
  //
  // Product kind comes FIRST: a token package is never an entitlement no
  // matter who bought it or what happened to it, so "not a grant product" is
  // the more fundamental answer than "nobody owns it". `null` — a product the
  // registry could not name — is treated the same way: unknown must grant
  // nothing, never guess.
  if (productKind === null || productKind === "token") {
    return { kind: "none", why: "notAGrantProduct" };
  }

  // AD-3: attribution precedes any grant. An unattributed purchase exists only
  // in `orders` and becomes a grant when the claim attributes it (D6).
  //
  // Reachable for an ENDING event only when there is no grant at all: the
  // shell loads the grant before it asks, and a loaded grant names its own
  // owner (payment-event.ts). A refund of a purchase that never became a grant
  // has nothing to close, so the answer is the same either way.
  if (memberId === null) {
    return { kind: "none", why: "noMember" };
  }

  // `endedAt` IS TERMINAL FOR THIS ADAPTER (AD-2). No Digistore24 event ever
  // clears it, so the guard sits BEFORE the event switch and covers every
  // event at once — including the ones nobody lists.
  //
  // Digistore24 retries until it gets a 200 and does not guarantee the order of
  // delivery, and the payload carries no sequence number, so the guard has to
  // be STATE-based and not timestamp-based. Two orderings it stops:
  //
  //   - a redelivered `on_payment` landing AFTER the `on_refund` that ended the
  //     grant — which would hand access back to a refunded customer;
  //   - `on_rebill_resumed` from a support "restart rebilling" months after
  //     expiry — a click, with no payment behind it.
  //
  // This is only half of the rule. The other half is `AND ended_at IS NULL` on
  // every write in manage.ts: this function decides on the grant it was HANDED,
  // and a concurrent delivery may have ended it since.
  if (grant?.endedAt != null) {
    return { kind: "none", why: "alreadyEnded" };
  }

  switch (event) {
    case "on_payment":
    // The initial payment of a subscription. Named alongside `on_payment`
    // everywhere else in this codebase (ipn.ts:84, schema-digistore.ts:29,
    // schema-tokens.ts:33) as the same fact: money arrived. Omitting it would
    // mean a subscription signup — the exact purchase this epic exists for —
    // produced no grant at all, and Digistore24 does not redeliver an event it
    // already got a 200 for, so there would be no second chance.
    //
    // NOT `on_rebill_resumed`, which also maps to "paid": AD-2 makes it RESUME
    // ONLY. It is a support click, not a payment, and must never create a
    // grant. Story 2.4 gives it its own transition, below.
    case "on_payment_subscription_signup":
      // Money arrived, so a suspension has no basis any more — "an on_payment
      // event may occur, if the buyer succeeds in payment after the
      // on_payment_missed event" (Digistore24). `activate` cannot do this job:
      // it is an INSERT ... ON CONFLICT DO NOTHING, which by design writes no
      // column of the row that already exists, so the suspension would survive
      // the payment that answered it. Access lost for a customer who paid.
      return grant?.suspendedAt != null ? { kind: "resume" } : { kind: "activate" };

    // Money went back. Both are read from the RAW event name, and they have to
    // be: `mapEventToSubscriptionStatus` returns null for both of them
    // (ipn.ts), deliberately — refunds run through the ORDER status, not the
    // subscription status. The mapper cannot express "ended" at all, so a
    // status-derived rule would not merely be lossy here, it would be silent.
    case "on_refund":
      return { kind: "end", reason: "refund" };
    case "on_chargeback":
      return { kind: "end", reason: "chargeback" };

    // --- Story 2.3: the two halves of a cancellation ------------------------
    //
    // These two cases are the whole reason this function takes the RAW event
    // name. Digistore24 sends them DAYS APART and this codebase maps BOTH to
    // "cancelled" — in `mapEventToStatus` (ipn.ts:93-95, the order status) and
    // again in `mapEventToSubscriptionStatus` (ipn.ts:121-123, the mirror).
    // Read that mapped value and the first of the two ends the grant, which
    // for a yearly plan cancelled in month one takes away eleven months the
    // customer paid for. Keep them adjacent; they only make sense as a pair.

    // Sent IMMEDIATELY when the buyer or support stops the rebilling. Billing
    // stops; ACCESS DOES NOT. Nothing to do — deliberately, and the reason
    // says so rather than falling through to the default.
    case "on_rebill_cancelled":
      return { kind: "none", why: "cancellationKeepsAccess" };

    // Sent when the last paid day is over ("usually early in the morning").
    // THIS is when purchased access ends — by event, never by a stored date,
    // which is why `accessUntil` is NULL on every purchase grant (AD-2).
    //
    // Reached only when the grant is still open: the terminal-`endedAt` guard
    // above already returned for a grant a refund closed, so the refund keeps
    // its `endedReason` and this event cannot overwrite it.
    case "last_paid_day":
      return { kind: "end", reason: "lastPaidDay" };

    // --- Story 2.4: suspension, and the two ways out of it -------------------

    // A payment is due and has not been made.
    //
    // UNCONDITIONAL, and Digistore24's own guide says so: "You may use the
    // 'payment missed' to cancel the access to the product" (IPN Guide p.5).
    // Their worked example settles the timing that an earlier version of this
    // file got wrong — Alice pays monthly on the 1st and cancels on 20 August;
    // her paid period runs to 31 August, and `payment_missed` arrives on
    // 1 September "or up to two days later". So it lands AT or AFTER the end
    // of the paid period, never before it. There is nothing here to protect
    // against, and the `billing_stop_reason` this used to branch on is not
    // even listed in the guide's parameter table.
    //
    // Suspension, not ending: a card that gets fixed must bring the access
    // back, and `last_paid_day` is what closes the grant for good.
    //
    // Deliberately NOT conditional on `grant`: the UPDATE behind it is
    // conditional (`ended_at IS NULL AND suspended_at IS NULL`), so a purchase
    // with no grant row simply matches nothing, and a grant created by a
    // delivery racing this one still gets suspended.
    case "on_payment_missed":
      return { kind: "suspend" };

    // Support (or the buyer) restarted the rebilling. NO MONEY MOVED — that is
    // the whole difference from `on_payment` above, and it is why this case is
    // not folded in with it even though both mapped values agree (§D4). An
    // UPDATE matching zero rows is the correct outcome for a purchase with no
    // grant; an INSERT would hand out an entitlement nobody paid for.
    case "on_rebill_resumed":
      return grant ? { kind: "resume" } : { kind: "none", why: "noGrant" };

    default:
      // Every other event, including ones Digistore24 has not invented yet.
      //
      // Access is decided by the EVENTS and by nothing else: `on_payment`
      // opens, `on_refund` / `on_chargeback` / `on_payment_missed` /
      // `last_paid_day` close. An event this file has never heard of changes
      // nothing — and must never throw, or the webhook 500s and Digistore24
      // redelivers the same payload forever.
      return { kind: "none", why: "irrelevantEvent" };
  }
}

// --- The state of a grant, as a person reads it (story 3.1) ------------------

/**
 * The four states a grant row can be in.
 *
 * `expired` is the one that is not in a column: a manual grant whose
 * `accessUntil` has passed is byte-identical to a live permanent grant except
 * for one timestamp comparison, and nothing in the row marks it. An Operator
 * looking at the raw columns cannot tell "still runs" from "ran out yesterday",
 * which is exactly the question a support case turns on.
 */
export type GrantState = "active" | "expired" | "suspended" | "ended";

/** The columns a state is derived from — nothing else is read. */
export interface GrantStateInput {
  /** NULL for every purchase grant (AD-2); manual grants may set it. */
  accessUntil: Date | null;
  /** Missed payment — reversible. */
  suspendedAt: Date | null;
  /** Refund · chargeback · last_paid_day · revoke — terminal. */
  endedAt: Date | null;
}

/**
 * What state is this grant in, seen from `now`?
 *
 * PURE, and the row-level twin of `activeFor()` in ./manage.ts: that one is the
 * SQL predicate the access API filters on, this one is the same three
 * conditions applied to a row that has already been loaded. A page cannot use a
 * SQL predicate, and re-deriving "is this active" by hand at the call site is
 * the drift the pair exists to prevent — so the invariant "`grantState` returns
 * `active` for exactly the rows `activeFor` matches" is asserted in
 * rules.test.ts, including the strict `>` on the boundary.
 *
 * Ordered guards, most terminal first:
 *
 *   - `endedAt` wins over everything. `endGrant()` carries no
 *     `suspended_at IS NULL` guard, so a suspended grant that is then refunded
 *     holds BOTH timestamps — and reporting that as "suspended" tells the
 *     Operator to expect a resume that can never come (`endedAt` is terminal
 *     for the adapter, AD-2).
 *   - `suspendedAt` wins over an elapsed `accessUntil`: suspension is the
 *     reversible state, and it names an action ("the card failed"), where
 *     "expired" names only the clock.
 */
export function grantState(row: GrantStateInput, now: Date): GrantState {
  if (row.endedAt !== null) return "ended";
  if (row.suspendedAt !== null) return "suspended";
  // Strictly greater, exactly as `gt(grants.accessUntil, now())` asks. Equal is
  // not active — the second the access runs to is over.
  if (row.accessUntil !== null && row.accessUntil.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

// --- What the MEMBER is told about a pause (story 3.5) -----------------------

/**
 * The Product Keys the Member should be told are PAUSED — suspended, and not
 * covered by anything they can still use.
 *
 * The subtraction is the whole function, and it is not cosmetic. A Member can
 * hold one key through TWO grants (the file header on `grantByHand` explains
 * why two are deliberately legal): a subscription whose card just failed, plus
 * a comp the Operator issued while it gets sorted out. `suspendedFor()` reports
 * the key, `entitlementsFor()` reports it too — and without this the account
 * page would list "Basis" as available and warn "your access to Basis is
 * paused" in the same breath. The comp is doing exactly its job; there is
 * nothing to warn about.
 *
 * PURE, and separate from the two queries, for the reason every rule in this
 * directory is: there is no test database, so a subtraction buried in a page
 * component is a rule nothing asserts.
 *
 * Order and duplicates come from the caller — `suspendedFor()` selects
 * DISTINCT and orders by key, so the result is stable and each key appears
 * once.
 */
export function pausedKeys(
  /** What the Member CAN use — `entitlementsFor()`. */
  active: readonly { productKey: string }[],
  /** What is suspended — `suspendedFor()`. */
  suspended: readonly string[],
): string[] {
  const usable = new Set(active.map((e) => e.productKey));
  return [...new Set(suspended)].filter((key) => !usable.has(key));
}
