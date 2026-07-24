// Purchases that reached nobody — the data behind the Operator's attach page.
//
// An unattributed purchase is a paid order with no member_id: the buyer paid
// under an address the app has never seen, or the identity did not resolve.
// The Operator attaches it to the right Member by hand; the attach shares the
// same claim path as an automatic sign-in claim (lib/digistore/claim.ts), so
// the two cannot drift.
import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { claimOneOrder, CLAIMABLE_STATUSES } from "./claim";

export interface UnattributedOrder {
  ds24OrderId: string;
  buyerEmail: string | null;
  productKey: string | null;
  amount: string | null;
  currency: string | null;
  createdAt: Date;
}

/**
 * Claimable orders with no Member attached, newest first.
 *
 * The SAME status set `claimOneOrder` accepts, imported rather than repeated
 * (story 2.3 §D4). The two must not drift: a row this list shows but the
 * attach refuses is an Operator clicking a button that silently does nothing,
 * and a row the attach would accept but the list hides is a purchase nobody
 * can reach — which is precisely the bug §D4 exists to fix. A cancelled
 * subscription inside its paid period belongs in this list.
 */
export async function listUnattributedOrders(): Promise<UnattributedOrder[]> {
  return db
    .select({
      ds24OrderId: orders.ds24OrderId,
      buyerEmail: orders.buyerEmail,
      productKey: orders.productKey,
      amount: orders.amount,
      currency: orders.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        isNull(orders.memberId),
        inArray(orders.status, CLAIMABLE_STATUSES),
      ),
    )
    .orderBy(desc(orders.createdAt));
}

/** Result of an attach attempt — a code the action translates. */
export type AttachResult =
  | { ok: true; credited: number }
  | { ok: false; reason: "orderNotFound" | "memberNotFound" | "alreadyAttributed" };

/**
 * Attaches one unattributed order to a Member, by their id.
 *
 * The heavy lifting — the conditional, fill-only update and the idempotent
 * credit — is `claimOneOrder`. This wrapper only turns the outcomes into codes
 * the UI can translate, and refuses when the order has been attributed since
 * the Operator opened the list (an IPN redelivery, or another Operator).
 */
export async function attachOrder(
  ds24OrderId: string,
  memberId: string,
): Promise<AttachResult> {
  const { users } = await import("@/db/schema");
  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);
  if (!member) return { ok: false, reason: "memberNotFound" };

  const [order] = await db
    .select({ memberId: orders.memberId })
    .from(orders)
    .where(eq(orders.ds24OrderId, ds24OrderId))
    .limit(1);
  if (!order) return { ok: false, reason: "orderNotFound" };
  if (order.memberId) return { ok: false, reason: "alreadyAttributed" };

  const { attached, credited } = await claimOneOrder(memberId, ds24OrderId);
  // attached=false means the row was taken between the checks above and the
  // conditional update — the same "already attributed" outcome, race-safe.
  if (!attached) return { ok: false, reason: "alreadyAttributed" };
  return { ok: true, credited };
}
