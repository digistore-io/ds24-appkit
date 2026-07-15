// Digistore24 IPN-Webhook: POST /api/ipn/<vendor>
// <vendor> ist die userId des SAAS-Betreibers (aus dem Onboarding).
//
// Ablauf: Signatur (SHA512) prüfen → connection_test beantworten →
// Event auf Order-Status abbilden → Order idempotent per ds24OrderId schreiben.
// Zusätzlich (Abrechnungs-Modelle):
//   - Token-Kauf (custom = "tokens:<paket>") → Guthaben gutschreiben (idempotent).
//   - Abo-Event mit purchase_id → subscriptions upserten (Status, Intervall,
//     Verwaltungs-Links für Kündigung/Bezahldaten/Rechnung).
import { db } from "@/db";
import { vendorSettings, orders, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyIpnSignature,
  mapEventToStatus,
  mapEventToSubscriptionStatus,
  type IpnParams,
} from "@/lib/digistore/ipn";
import { creditTokens } from "@/lib/tokens/account";
import { parseTokenCustomMarker, getTokenPackage } from "@/lib/tokens/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Digistore24 validiert die IPN-URL beim Einrichten (ipnSetup) per GET-Request
// und erwartet HTTP 200. Deshalb antwortet GET schlicht mit "OK" (kein Effekt).
export function GET() {
  return new Response("OK");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vendor: string }> },
) {
  const { vendor } = await params;

  // form-urlencoded Body einlesen.
  const raw = await request.text();
  const body: IpnParams = Object.fromEntries(new URLSearchParams(raw));

  const settings = await db.query.vendorSettings.findFirst({
    where: eq(vendorSettings.userId, vendor),
  });
  if (!settings) return new Response("Vendor not found", { status: 404 });
  if (!settings.ds24IpnPassphrase) {
    return new Response("IPN not configured", { status: 403 });
  }

  // Signaturprüfung — fail-closed.
  if (!verifyIpnSignature(body, settings.ds24IpnPassphrase)) {
    return new Response("Invalid signature", { status: 403 });
  }

  // Erste gültige Zustellung markiert die IPN-Verbindung als verifiziert.
  if (!settings.ds24IpnVerified) {
    await db
      .update(vendorSettings)
      .set({ ds24IpnVerified: true, updatedAt: new Date() })
      .where(eq(vendorSettings.userId, vendor));
  }

  const event = body["event"] || body["order_event"] || "";

  // Verbindungstest aus dem DS24-Backend: einfach mit "OK" antworten.
  if (event === "connection_test") return new Response("OK");

  const status = mapEventToStatus(event);
  const orderId = body["order_id"] || body["ds24_order_id"];
  const buyerEmail = body["buyer_email"] || body["email"] || null;
  const purchaseId = body["purchase_id"] || null;
  const packageKey = parseTokenCustomMarker(body["custom"]);

  if (status && orderId) {
    const existing = await db.query.orders.findFirst({
      where: eq(orders.ds24OrderId, orderId),
    });
    if (existing) {
      await db
        .update(orders)
        .set({ status, updatedAt: new Date() })
        .where(eq(orders.ds24OrderId, orderId));
    } else {
      const gdpr = body["is_gdpr_country"];
      await db
        .insert(orders)
        .values({
          userId: vendor,
          ds24OrderId: orderId,
          ds24ProductId: body["product_id"] || body["ds24_product_id"] || null,
          status,
          buyerEmail,
          buyerFirstName:
            body["buyer_first_name"] || body["address_first_name"] || null,
          buyerLastName:
            body["buyer_last_name"] || body["address_last_name"] || null,
          amount: body["amount"] || null,
          currency: body["currency"] || null,
          isGdprCountry: gdpr === "Y" ? true : gdpr === "N" ? false : null,
        })
        // Race-sichere Idempotenz: paralleler IPN mit gleicher order_id → no-op.
        .onConflictDoNothing({ target: orders.ds24OrderId });
    }
  }

  // --- Token-Kauf: Guthaben gutschreiben (idempotent über order_id) ----------
  // Gilt für erstmaligen Paketkauf UND fürs Auto-Aufladen (billing-on-demand):
  // beide tragen custom = "tokens:<paket>". Der Lock wird dabei gelöst.
  if (packageKey && status === "paid" && orderId && buyerEmail) {
    const pkg = getTokenPackage(packageKey); // wirft bei unbekanntem Paket
    await creditTokens({
      userId: vendor,
      buyerEmail,
      credits: pkg.credits,
      ds24OrderId: orderId,
      note: `Kauf ${pkg.title} (${pkg.credits} Token)`,
      releaseReloadLock: true,
      linkPurchaseId: purchaseId ?? undefined,
    });
  }

  // --- Abo: subscriptions upserten (Status/Intervall + Verwaltungs-Links) ----
  // Nur echte Abos, keine Token-Käufe (die sind Einmal-Buchungen).
  const subStatus = mapEventToSubscriptionStatus(event);
  if (!packageKey && subStatus && purchaseId) {
    await upsertSubscription(vendor, purchaseId, subStatus, orderId, buyerEmail, body);
  }

  // DS24 erwartet als Erfolgsantwort den Body "OK".
  return new Response("OK");
}

/** Legt ein Abo an oder aktualisiert Status, Intervall und Verwaltungs-Links. */
async function upsertSubscription(
  vendor: string,
  purchaseId: string,
  status: "active" | "paused" | "cancelled",
  orderId: string | undefined,
  buyerEmail: string | null,
  body: IpnParams,
): Promise<void> {
  const now = new Date();
  const billingInterval =
    body["billing_interval"] || body["other_billing_intervals"] || null;
  const managementUrls = {
    renewUrl: body["renew_url"] || null,
    rebillingStopUrl: body["rebilling_stop_url"] || null,
    invoiceUrl: body["invoice_url"] || body["receipt_url"] || null,
    supportUrl: body["support_url"] || null,
  };
  await db
    .insert(subscriptions)
    .values({
      userId: vendor,
      ds24PurchaseId: purchaseId,
      ds24OrderId: orderId ?? null,
      ds24ProductId: body["product_id"] || null,
      buyerEmail,
      status,
      billingInterval,
      amount: body["amount"] || null,
      currency: body["currency"] || null,
      ...managementUrls,
    })
    .onConflictDoUpdate({
      target: [subscriptions.userId, subscriptions.ds24PurchaseId],
      set: {
        status,
        billingInterval,
        // Leere Werte nicht über bereits gesetzte Links schreiben.
        ...(managementUrls.renewUrl ? { renewUrl: managementUrls.renewUrl } : {}),
        ...(managementUrls.rebillingStopUrl
          ? { rebillingStopUrl: managementUrls.rebillingStopUrl }
          : {}),
        ...(managementUrls.invoiceUrl
          ? { invoiceUrl: managementUrls.invoiceUrl }
          : {}),
        ...(managementUrls.supportUrl
          ? { supportUrl: managementUrls.supportUrl }
          : {}),
        updatedAt: now,
      },
    });
}
