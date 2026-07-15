// Verbrauchs- und Abo-Abrechnung über Digistore24 jenseits von createBuyUrl:
//
//  - createBillingOnDemand: bucht gegen eine BESTEHENDE purchase_id eine weitere
//    Zahlung ab (die Zahlungsmethode des Kunden ist bereits autorisiert). Damit
//    werden Prepaid-Token-Pakete nachgekauft/auto-nachgeladen — OHNE neuen Checkout.
//  - stopRebilling: kündigt ein Abo (stoppt die Wiederholungszahlungen).
//  - getPurchase / listPurchases: Abo-Status & Verwaltungs-Links (Bezahldaten
//    ändern, Rechnung ansehen) abrufen.
//
// Voraussetzungen für createBillingOnDemand (siehe docs/digistore-billing-modes.md):
//   1. Der Erstkauf muss mit settings[force_rebilling]=Y erzeugt worden sein
//      (Offer.forceRebilling in buyUrl.ts) ODER ein aktives Abo sein.
//   2. writable-API-Key + im DS24-Konto das Recht „billing on demand".
//   3. DS24-Limits: 10 Buchungen/Tag und 1/Minute je purchase_id (Prod).
//
// Wie createBuyUrl: bei Fehlern wird geworfen — KEIN stiller Mock-Fallback
// (eine fehlgeschlagene Abbuchung darf nie als Erfolg gelten).
import { ds24Post } from "./client";

export interface BillOnDemandArgs {
  /** DS24 purchase_id des Kunden, gegen die abgebucht wird. */
  purchaseId: string;
  /** DS24-Produkt-ID des abzurechnenden (Token-)Pakets. */
  productId: string;
  /** Preis in Cent. */
  priceCents: number;
  /** Währung, Default "EUR". */
  currency?: string;
  /** Stückzahl (z. B. mehrere Pakete auf einmal), Default 1. */
  quantity?: number;
  /**
   * Kontext, der im IPN unter `custom` ankommt — hier steht z. B.
   * "tokens:<paketSchlüssel>", damit der IPN-Handler die Gutschrift zuordnen kann.
   */
  custom?: string;
  affiliate?: string;
}

export interface BillOnDemandResult {
  /** Neue Purchase-ID der erzeugten Buchung. */
  createdPurchaseId: string;
  /** DS24-Zahlungsstatus (z. B. "paid"). */
  paymentStatus: string;
  /** DS24-Abrechnungsstatus (z. B. "completed"). */
  billingStatus: string;
  paidAmount?: string;
  currency?: string;
  /** Leer, wenn sofort bezahlt; sonst Zahllink für offene Beträge. */
  payUrl: string;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Baut den x-www-form-urlencoded Body für createBillingOnDemand (pure, testbar).
 * number_of_installments=1 → einmalige Zusatzbuchung (kein neues Abo).
 */
export function buildBillOnDemandBody(args: BillOnDemandArgs): URLSearchParams {
  const body = new URLSearchParams();
  body.set("purchase_id", args.purchaseId);
  body.set("product_id", args.productId);

  const price = euros(args.priceCents);
  body.set("payment_plan[first_amount]", price);
  // Einmalige Zusatzbuchung: keine Folgebeträge.
  body.set("payment_plan[other_amounts]", "0.00");
  body.set("payment_plan[currency]", args.currency ?? "EUR");
  body.set("payment_plan[number_of_installments]", "1");

  body.set("settings[quantity]", String(args.quantity ?? 1));

  if (args.custom) body.set("tracking[custom]", args.custom);
  if (args.affiliate) body.set("tracking[affiliate]", args.affiliate);

  return body;
}

/**
 * Bucht per createBillingOnDemand eine Zahlung gegen eine bestehende purchase_id.
 * Wirft bei Fehler. Die Token-Gutschrift erfolgt NICHT hier, sondern erst, wenn
 * DS24 den Kauf per IPN (on_payment) bestätigt — so wie ein normaler Kauf.
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
    throw new Error("Digistore24 lieferte keine created_purchase_id zurück.");
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
 * Kündigt ein Abo: stoppt die wiederkehrenden Zahlungen (Rebilling) für eine
 * purchase_id. Der Zugang bleibt i. d. R. bis zum Ende der bezahlten Periode
 * bestehen (DS24 sendet dann `last_paid_day`). Wirft bei Fehler.
 */
export async function stopRebilling(
  apiKey: string,
  purchaseId: string,
): Promise<void> {
  await ds24Post("stopRebilling", apiKey, { purchase_id: purchaseId });
}

/** Rohdaten eines DS24-Kaufs (Teilmenge). */
export interface PurchaseInfo {
  purchaseId: string;
  productId?: string;
  buyerEmail?: string;
  /** "Y" wenn das Abo gekündigt ist. */
  isCanceledNow: boolean;
  /** z. B. "1_month" | "12_month". */
  billingInterval?: string;
  amount?: string;
  currency?: string;
  // Verwaltungs-Links (an den Kunden verlinken).
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
 * Liest einen einzelnen Kauf (Abo-Status + Verwaltungs-Links). Nützlich, um
 * fehlende renew_url/rebilling_stop_url/invoice_url nachzuladen, die im IPN nicht
 * immer mitkommen.
 */
export async function getPurchase(
  apiKey: string,
  purchaseId: string,
): Promise<PurchaseInfo> {
  const res = await ds24Post("getPurchase", apiKey, { purchase_id: purchaseId });
  return toPurchaseInfo((res.data ?? {}) as Record<string, unknown>);
}

/**
 * Listet Käufe/Abos (paginiert). Für „Rechnungen ansehen" und Abo-Übersichten.
 * `filter` erlaubt DS24-Filter wie { email, billing_type: "subscription" }.
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
