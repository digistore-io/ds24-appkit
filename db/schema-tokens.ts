// Abrechnungs-Modelle jenseits einmaliger/wiederkehrender Käufe:
//
//  - subscriptions:  ein wiederkehrendes Abo eines Kunden. Hält die DS24
//                    `purchase_id` (für stopRebilling + createBillingOnDemand)
//                    und die von DS24 gelieferten Verwaltungs-Links
//                    (Bezahldaten ändern, Kündigen, Rechnung). Status/Intervall
//                    werden über IPN-Events gepflegt.
//  - tokenAccounts:  Prepaid-Guthaben je Kunde (ganzzahlige "Token"/Credits für
//                    verbrauchsbasierte KI-Nutzung) inkl. Auto-Aufladen.
//  - tokenLedger:    fortlaufendes, unveränderliches Buchungsjournal. Jede
//                    Aufladung/Buchung ist eine Zeile; Aufladungen sind über
//                    ds24OrderId idempotent (ein IPN darf nie doppelt gutschreiben).
//
// Kunden werden über (userId = Vendor) + buyerEmail identifiziert — dieselbe
// Kennung wie in `orders`. Wer echte Login-Nutzer statt E-Mail koppeln will,
// ersetzt buyerEmail durch eine users-Referenz.
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// Status eines Abos, getrieben durch DS24-IPN-Events.
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active", // on_payment(_subscription_signup) / on_rebill_resumed
  "paused", // on_payment_missed
  "cancelled", // on_rebill_cancelled / last_paid_day
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Besitzender Vendor (SAAS-Betreiber).
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // DS24 purchase_id — Grundlage für stopRebilling & createBillingOnDemand.
    // Unique je Vendor: ein Abo pro Purchase.
    ds24PurchaseId: text("ds24_purchase_id").notNull(),
    // Ursprüngliche Bestell-ID (Verknüpfung zu `orders`).
    ds24OrderId: text("ds24_order_id"),
    ds24ProductId: text("ds24_product_id"),
    // Kunde (identisch zu orders.buyerEmail).
    buyerEmail: text("buyer_email"),
    status: subscriptionStatusEnum("status").notNull(),
    // z. B. "1_month" | "12_month". Bestimmt monatlich/jährlich.
    billingInterval: text("billing_interval"),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    currency: text("currency"),
    // Von DS24 gelieferte Verwaltungs-Links (aus IPN oder getPurchase).
    // Bezahldaten ändern: renewUrl. Kündigen: rebillingStopUrl. Rechnung: invoiceUrl.
    renewUrl: text("renew_url"),
    rebillingStopUrl: text("rebilling_stop_url"),
    invoiceUrl: text("invoice_url"),
    supportUrl: text("support_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("subscriptions_vendor_purchase").on(t.userId, t.ds24PurchaseId),
    index("subscriptions_vendor_email").on(t.userId, t.buyerEmail),
  ],
);

export const tokenAccounts = pgTable(
  "token_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Kunde (identisch zu orders.buyerEmail).
    buyerEmail: text("buyer_email").notNull(),
    // Aktueller Guthabenstand in Token/Credits (nie negativ).
    balance: integer("balance").notNull().default(0),
    // --- Auto-Aufladen -------------------------------------------------------
    autoReloadEnabled: boolean("auto_reload_enabled").notNull().default(false),
    // Schwelle: fällt balance <= threshold, wird nachgeladen.
    autoReloadThreshold: integer("auto_reload_threshold").notNull().default(0),
    // Welches Paket (Schlüssel aus lib/tokens/packages.ts) nachgeladen wird.
    autoReloadPackageKey: text("auto_reload_package_key"),
    // DS24 purchase_id, gegen die per createBillingOnDemand abgebucht wird.
    ds24PurchaseId: text("ds24_purchase_id"),
    // Concurrency-Lock gegen Doppelabbuchung: gesetzt vor dem billing-on-demand,
    // gelöst, sobald der IPN die Gutschrift gebucht hat (oder nach Timeout stale).
    reloadLockedAt: timestamp("reload_locked_at"),
    lastReloadAt: timestamp("last_reload_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("token_accounts_vendor_email").on(t.userId, t.buyerEmail)],
);

// Buchungsart im Journal.
export const tokenLedgerTypeEnum = pgEnum("token_ledger_type", [
  "topup", // Gutschrift nach bezahltem Paket (IPN)
  "consume", // Verbrauch (KI-Nutzung)
  "refund", // Rückerstattung/Storno
  "adjust", // manuelle Korrektur
]);

export const tokenLedger = pgTable(
  "token_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => tokenAccounts.id, { onDelete: "cascade" }),
    type: tokenLedgerTypeEnum("type").notNull(),
    // Signierte Menge: + für topup/refund/adjust-hoch, − für consume.
    amount: integer("amount").notNull(),
    // Guthaben nach dieser Buchung (Audit).
    balanceAfter: integer("balance_after").notNull(),
    // DS24-Bestell-ID der auslösenden Zahlung — macht Gutschriften idempotent.
    ds24OrderId: text("ds24_order_id"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Ein bezahltes Paket (ds24OrderId) darf nur einmal gutgeschrieben werden.
    unique("token_ledger_topup_order").on(t.accountId, t.ds24OrderId),
    index("token_ledger_account").on(t.accountId),
  ],
);
