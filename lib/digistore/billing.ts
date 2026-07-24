// Usage-based and subscription billing through Digistore24, beyond
// createBuyUrl:
//
//  - createBillingOnDemand: charges another payment against an EXISTING
//    purchase_id (the customer's payment method is already authorized). This is
//    how prepaid token packages are repurchased / auto-topped-up — WITHOUT a
//    new checkout.
//  - stopRebilling: cancels a subscription (stops the recurring payments).
//  - getPurchase / listPurchases: fetch subscription status and management
//    links (change payment details, view invoice).
//
// Prerequisites for createBillingOnDemand (see docs/digistore-billing-modes.md):
//   1. The initial purchase must have been created with
//      settings[force_rebilling]=Y (Offer.forceRebilling in buyUrl.ts) OR be an
//      active subscription.
//   2. A writable API key + the "billing on demand" right in the DS24 account.
//   3. DS24 limits: 10 charges/day and 1/minute per purchase_id (production).
//
// Like createBuyUrl: errors throw — NO silent mock fallback (a failed charge
// must never count as a success).
import { ds24Post } from "./client";

export interface BillOnDemandArgs {
  /** The customer's DS24 purchase_id being charged. */
  purchaseId: string;
  /** DS24 product ID of the (token) package being billed. */
  productId: string;
  /** Price in cents. */
  priceCents: number;
  /** Currency, default "EUR". */
  currency?: string;
  /** Quantity (e.g. several packages at once), default 1. */
  quantity?: number;
  /**
   * Context that arrives in the IPN under `custom` — e.g.
   * "tokens:<packageKey>", so the IPN handler can match up the credit.
   */
  custom?: string;
  affiliate?: string;
}

export interface BillOnDemandResult {
  /** New purchase ID of the created charge. */
  createdPurchaseId: string;
  /** DS24 payment status (e.g. "paid"). */
  paymentStatus: string;
  /** DS24 billing status (e.g. "completed"). */
  billingStatus: string;
  paidAmount?: string;
  currency?: string;
  /** Empty when paid immediately; otherwise a payment link for open amounts. */
  payUrl: string;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Builds the x-www-form-urlencoded body for createBillingOnDemand (pure,
 * testable). number_of_installments=1 → a one-off extra charge (not a new
 * subscription).
 */
export function buildBillOnDemandBody(args: BillOnDemandArgs): URLSearchParams {
  const body = new URLSearchParams();
  body.set("purchase_id", args.purchaseId);
  body.set("product_id", args.productId);

  const price = euros(args.priceCents);
  body.set("payment_plan[first_amount]", price);
  // One-off extra charge: no follow-up amounts.
  body.set("payment_plan[other_amounts]", "0.00");
  body.set("payment_plan[currency]", args.currency ?? "EUR");
  body.set("payment_plan[number_of_installments]", "1");

  body.set("settings[quantity]", String(args.quantity ?? 1));

  if (args.custom) body.set("tracking[custom]", args.custom);
  if (args.affiliate) body.set("tracking[affiliate]", args.affiliate);

  return body;
}

/**
 * Charges a payment against an existing purchase_id via createBillingOnDemand.
 * Throws on error. The token credit does NOT happen here but only once DS24
 * confirms the purchase via IPN (on_payment) — just like a normal purchase.
 */
export async function createBillingOnDemand(
  apiKey: string,
  args: BillOnDemandArgs,
): Promise<BillOnDemandResult> {
  const params = Object.fromEntries(buildBillOnDemandBody(args).entries());
  const res = await ds24Post("createBillingOnDemand", apiKey, params);
  const d = (res.data ?? {}) as Record<string, unknown>;
  const createdPurchaseId = String(d.created_purchase_id ?? "");
  if (!createdPurchaseId) {
    throw new Error("Digistore24 returned no created_purchase_id.");
  }
  return {
    createdPurchaseId,
    paymentStatus: String(d.payment_status ?? ""),
    billingStatus: String(d.billing_status ?? ""),
    paidAmount: d.paid_amount != null ? String(d.paid_amount) : undefined,
    currency: d.currency != null ? String(d.currency) : undefined,
    payUrl: String(d.pay_url ?? ""),
  };
}

/**
 * Cancels a subscription: stops the recurring payments (rebilling) for a
 * purchase_id. Access usually remains until the end of the paid period (DS24
 * then sends `last_paid_day`). Throws on error.
 */
export async function stopRebilling(
  apiKey: string,
  purchaseId: string,
): Promise<void> {
  await ds24Post("stopRebilling", apiKey, { purchase_id: purchaseId });
}

/** Raw data of a DS24 purchase (subset). */
export interface PurchaseInfo {
  purchaseId: string;
  productId?: string;
  buyerEmail?: string;
  /** "Y" when the subscription is cancelled. */
  isCanceledNow: boolean;
  /** e.g. "1_month" | "12_month". */
  billingInterval?: string;
  amount?: string;
  currency?: string;
  // Management links (to link to the customer).
  renewUrl?: string;
  rebillingStopUrl?: string;
  invoiceUrl?: string;
  receiptUrl?: string;
  supportUrl?: string;
}

function toPurchaseInfo(d: Record<string, unknown>): PurchaseInfo {
  const s = (k: string): string | undefined =>
    d[k] != null && d[k] !== "" ? String(d[k]) : undefined;
  return {
    purchaseId: String(d.purchase_id ?? d.id ?? ""),
    productId: s("product_id"),
    buyerEmail: s("email") ?? s("buyer_email"),
    isCanceledNow: String(d.is_canceled_now ?? "") === "Y",
    billingInterval: s("other_billing_intervals") ?? s("billing_interval"),
    amount: s("amount"),
    currency: s("currency"),
    renewUrl: s("renew_url"),
    rebillingStopUrl: s("rebilling_stop_url"),
    invoiceUrl: s("invoice_url"),
    receiptUrl: s("receipt_url"),
    supportUrl: s("support_url"),
  };
}

/**
 * Reads a single purchase (subscription status + management links). Useful for
 * fetching missing renew_url/rebilling_stop_url/invoice_url, which do not
 * always come along in the IPN.
 */
export async function getPurchase(
  apiKey: string,
  purchaseId: string,
): Promise<PurchaseInfo> {
  const res = await ds24Post("getPurchase", apiKey, { purchase_id: purchaseId });
  return toPurchaseInfo((res.data ?? {}) as Record<string, unknown>);
}

/**
 * Lists purchases/subscriptions (paginated). For "view invoices" and
 * subscription overviews. `filter` accepts DS24 filters such as
 * { email, billing_type: "subscription" }.
 */
export async function listPurchases(
  apiKey: string,
  filter: Record<string, string> = {},
): Promise<PurchaseInfo[]> {
  const res = await ds24Post("listPurchases", apiKey, filter);
  const data = (res.data ?? {}) as Record<string, unknown>;
  const rows = (data.purchases ?? data.list ?? []) as unknown;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => toPurchaseInfo(r as Record<string, unknown>));
}
