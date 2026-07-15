// Digistore24-spezifische Tabellen (domänenneutral gehalten).
//
// vendorSettings: pro SAAS-Betreiber ("Vendor") die Digistore24-Zugangsdaten.
// orders:         jede über Digistore24 abgerechnete Bestellung + ihr Status
//                 (getrieben durch IPN-Events). ds24OrderId ist unique → Idempotenz.
import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// Status-Maschine einer Bestellung, gesteuert durch Digistore24-IPN-Events.
export const orderStatusEnum = pgEnum("order_status", [
  "paid", // on_payment / on_payment_subscription_signup
  "refunded", // on_refund
  "chargeback", // on_chargeback
  "paused", // on_payment_missed
  "cancelled", // last_paid_day / on_rebill_cancelled
]);

export const vendorSettings = pgTable("vendor_settings", {
  // 1:1 zum SAAS-Betreiber (Auth.js-User).
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Digistore24 REST-API-Key (Header X-DS-API-KEY). NUR serverseitig lesen.
  ds24ApiKey: text("ds24_api_key"),
  ds24ApiKeyVerified: boolean("ds24_api_key_verified").notNull().default(false),
  // Temporäres Token während des interaktiven Connect-Flows (requestApiKey →
  // retrieveApiKey). Nach erfolgreichem Abruf wieder geleert.
  ds24RequestToken: text("ds24_request_token"),
  // Passphrase zur SHA512-Verifikation eingehender IPN-Calls (sha_sign).
  ds24IpnPassphrase: text("ds24_ipn_passphrase"),
  ds24IpnVerified: boolean("ds24_ipn_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Besitzender Vendor.
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Digistore24-Bestell-ID — unique für Idempotenz eingehender IPN-Calls.
  ds24OrderId: text("ds24_order_id").notNull().unique(),
  ds24ProductId: text("ds24_product_id"),
  status: orderStatusEnum("status").notNull(),
  // Käufer-Daten aus dem IPN-Payload.
  buyerEmail: text("buyer_email"),
  buyerFirstName: text("buyer_first_name"),
  buyerLastName: text("buyer_last_name"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency"),
  // DSGVO: is_gdpr_country=Y → Consent nötig; gesetzt, sobald Opt-in erfolgt.
  isGdprCountry: boolean("is_gdpr_country"),
  gdprConsentAt: timestamp("gdpr_consent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Cache für generierte Checkout-URLs (createBuyUrl).
// Schlüssel = (userId, offerKey). offerHash erkennt Angebotsänderungen:
// ändert sich das Angebot, entsteht ein neuer Hash → neue URL. Zusätzlich TTL.
export const buyUrlCache = pgTable(
  "buy_url_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Stabiler Angebots-Schlüssel (z. B. "gold", "pro_yearly").
    offerKey: text("offer_key").notNull(),
    // sha256 über die DS24-relevanten Angebotsfelder.
    offerHash: text("offer_hash").notNull(),
    url: text("url").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("buy_url_cache_user_offer").on(t.userId, t.offerKey)],
);
