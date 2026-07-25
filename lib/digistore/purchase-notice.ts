// What to tell somebody who has just paid.
//
// PURE — no database, and the product lookup is handed in rather than imported
// as a fact. Same split, and the same reason, as ./attribution.ts and
// ./claimable.ts: there is no test database in this repo, so a rule that ends
// up inside a query is a rule nothing asserts. The lookup shell lives in
// ./member-billing.ts, where it is scoped to one member.
//
// It returns a CODE plus values, never a sentence. A sentence born in `lib/` is
// a sentence in exactly one language — see CLAUDE.md, *Languages*. The page
// turns these into text through `messages/*.json`.
import type { ProductDef } from "./products";
import type { OrderStatus } from "./claimable";

/** The parts of an order this decision reads. */
export interface PurchaseOrder {
  status: OrderStatus;
  productKey: string | null;
  /** Credits as RECORDED AT PAYMENT TIME. Not the registry's current value. */
  credits: number | null;
}

export type PurchaseNotice =
  /** A token package: this many credits landed on the balance. */
  | { kind: "tokens"; credits: number }
  /** A subscription or one-off purchase: this is what was unlocked. */
  | { kind: "plan"; product: string }
  /** Something was bought, but nothing about it can be named honestly. */
  | { kind: "generic" };

/**
 * The message for a completed purchase, or `null` when there is nothing to say.
 *
 * `lookup` returns `null` for a key the registry does not (or no longer) hold —
 * `getProduct()` throws there, and it must not throw here: the registry is a
 * file the app-builder edits, so the key an old order names can simply be gone.
 * Use `findProduct` from ./products.
 */
export function purchaseNotice(
  order: PurchaseOrder | null | undefined,
  lookup: (key: string) => ProductDef | null,
): PurchaseNotice | null {
  if (!order) return null;

  // Only a PAID order is a success. At the moment of the redirect it always is,
  // so this guard is not about the happy path — it is about the reference
  // surviving in a bookmark, a history entry or a link somebody kept. For
  // `refunded` and `chargeback` the money went back, and congratulating
  // somebody then is worse than silence; `cancelled` and `paused` are not a
  // purchase that just completed either.
  //
  // Deliberately NOT an exhaustive switch, unlike isClaimable(): a status added
  // to the enum later is not a success until somebody decides it is, and
  // falling through to silence is the safe direction.
  if (order.status !== "paid") return null;

  const def = order.productKey ? lookup(order.productKey) : null;
  if (!def) return { kind: "generic" };

  if (def.kind === "token") {
    // orders.credits, never def.credits. The order records what was actually
    // credited; the registry is live and editable, so reading it here would
    // make the toast disagree with the balance the moment a package is
    // repriced. schema-digistore.ts states the same rule for the column.
    const credits = order.credits;
    if (typeof credits !== "number" || credits <= 0) return { kind: "generic" };
    return { kind: "tokens", credits };
  }

  // The product NAME, untranslated on purpose — that is template policy
  // (CLAUDE.md, *Languages*): the same text is on file at Digistore24.
  return { kind: "plan", product: def.name };
}
