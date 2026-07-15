// Prepaid-Token-Konten: Guthaben führen, Verbrauch abziehen, nach bezahltem Kauf
// gutschreiben und bei Bedarf automatisch nachladen (Auto-Recharge).
//
// Aufteilung:
//   - Pure Entscheidungslogik (unten zuerst) — ohne DB, direkt testbar.
//   - DB-Operationen (Transaktionen, Row-Locks) für Guthaben/Journal.
//   - autoReloadIfNeeded(): Orchestrierung (prüfen → Lock → billing-on-demand).
//     Die Gutschrift selbst passiert NICHT hier, sondern erst im IPN-Handler,
//     wenn DS24 die Zahlung bestätigt (on_payment).
import { db } from "@/db";
import { tokenAccounts, tokenLedger } from "@/db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { createBillingOnDemand, type BillOnDemandArgs } from "@/lib/digistore/billing";
import { productId } from "@/lib/digistore/products";
import { getTokenPackage, tokenCustomMarker } from "./packages";

/** Wird geworfen, wenn ein Verbrauch das Guthaben übersteigen würde. */
export class InsufficientTokensError extends Error {
  constructor(
    public readonly balance: number,
    public readonly requested: number,
  ) {
    super(`Zu wenig Token: Guthaben ${balance}, benötigt ${requested}.`);
    this.name = "InsufficientTokensError";
  }
}

// Stale-Lock-Timeout: ein hängengebliebener Reload-Lock wird nach so vielen
// Stunden wieder freigegeben (falls ein IPN nie ankam).
const RELOAD_LOCK_TIMEOUT_HOURS = 6;

// --- Pure Entscheidungslogik -------------------------------------------------

/** Reicht das Guthaben für einen Verbrauch? */
export function hasSufficientBalance(balance: number, cost: number): boolean {
  return cost >= 0 && balance >= cost;
}

/** Soll auto-nachgeladen werden? (aktiviert UND Guthaben <= Schwelle) */
export function shouldAutoReload(account: {
  balance: number;
  autoReloadEnabled: boolean;
  autoReloadThreshold: number;
}): boolean {
  return account.autoReloadEnabled && account.balance <= account.autoReloadThreshold;
}

/** Ist ein gesetzter Reload-Lock veraltet (Timeout überschritten)? */
export function isReloadLockStale(
  lockedAt: Date | null,
  now: Date,
  timeoutHours: number = RELOAD_LOCK_TIMEOUT_HOURS,
): boolean {
  if (!lockedAt) return true; // kein Lock = frei
  return lockedAt.getTime() < now.getTime() - timeoutHours * 3_600_000;
}

// --- DB-Operationen ----------------------------------------------------------

export async function getTokenAccount(userId: string, buyerEmail: string) {
  return db.query.tokenAccounts.findFirst({
    where: and(
      eq(tokenAccounts.userId, userId),
      eq(tokenAccounts.buyerEmail, buyerEmail),
    ),
  });
}

/** Legt bei Bedarf ein (leeres) Konto an und gibt es zurück. */
export async function getOrCreateTokenAccount(userId: string, buyerEmail: string) {
  await db
    .insert(tokenAccounts)
    .values({ userId, buyerEmail })
    .onConflictDoNothing({
      target: [tokenAccounts.userId, tokenAccounts.buyerEmail],
    });
  const acct = await getTokenAccount(userId, buyerEmail);
  if (!acct) throw new Error("Token-Konto konnte nicht angelegt werden.");
  return acct;
}

/**
 * Zieht Token ab (Verbrauch). Transaktion + Row-Lock (FOR UPDATE) verhindern
 * Race-Conditions bei parallelen Anfragen. Wirft InsufficientTokensError, wenn
 * das Guthaben nicht reicht. Gibt das neue Guthaben zurück.
 */
export async function consumeTokens(args: {
  userId: string;
  buyerEmail: string;
  amount: number;
  note?: string;
  now?: Date;
}): Promise<number> {
  if (args.amount <= 0) throw new Error("amount muss > 0 sein.");
  const now = args.now ?? new Date();
  return db.transaction(async (tx) => {
    const [acct] = await tx
      .select()
      .from(tokenAccounts)
      .where(
        and(
          eq(tokenAccounts.userId, args.userId),
          eq(tokenAccounts.buyerEmail, args.buyerEmail),
        ),
      )
      .for("update");
    if (!acct) throw new InsufficientTokensError(0, args.amount);
    if (!hasSufficientBalance(acct.balance, args.amount)) {
      throw new InsufficientTokensError(acct.balance, args.amount);
    }
    const newBalance = acct.balance - args.amount;
    await tx
      .update(tokenAccounts)
      .set({ balance: newBalance, updatedAt: now })
      .where(eq(tokenAccounts.id, acct.id));
    await tx.insert(tokenLedger).values({
      accountId: acct.id,
      type: "consume",
      amount: -args.amount,
      balanceAfter: newBalance,
      note: args.note,
    });
    return newBalance;
  });
}

/**
 * Schreibt Token nach einer bestätigten Zahlung gut. Idempotent über
 * (accountId, ds24OrderId): ein zweiter IPN mit derselben Order-ID bucht NICHT
 * erneut. Löst optional den Auto-Reload-Lock. Gibt zurück, ob gutgeschrieben
 * wurde, und das (ggf. unveränderte) Guthaben.
 */
export async function creditTokens(args: {
  userId: string;
  buyerEmail: string;
  credits: number;
  ds24OrderId: string;
  note?: string;
  /** Nach erfolgreichem Auto-Reload den Lock freigeben. */
  releaseReloadLock?: boolean;
  /**
   * purchase_id des Kaufs — wird als Abbuchungsziel fürs Auto-Aufladen gemerkt,
   * falls das Konto noch keins hat (z. B. beim ersten Token-Kauf mit
   * force_rebilling).
   */
  linkPurchaseId?: string;
  now?: Date;
}): Promise<{ credited: boolean; balance: number }> {
  if (args.credits <= 0) throw new Error("credits muss > 0 sein.");
  const now = args.now ?? new Date();
  // Konto sicherstellen (außerhalb der Transaktion, idempotent).
  await getOrCreateTokenAccount(args.userId, args.buyerEmail);
  return db.transaction(async (tx) => {
    const [acct] = await tx
      .select()
      .from(tokenAccounts)
      .where(
        and(
          eq(tokenAccounts.userId, args.userId),
          eq(tokenAccounts.buyerEmail, args.buyerEmail),
        ),
      )
      .for("update");
    if (!acct) throw new Error("Token-Konto verschwunden.");

    const newBalance = acct.balance + args.credits;
    // Journal-Zeile zuerst — kollidiert sie (gleiche ds24OrderId), war der Kauf
    // schon gebucht → nichts tun.
    const inserted = await tx
      .insert(tokenLedger)
      .values({
        accountId: acct.id,
        type: "topup",
        amount: args.credits,
        balanceAfter: newBalance,
        ds24OrderId: args.ds24OrderId,
        note: args.note,
      })
      .onConflictDoNothing({
        target: [tokenLedger.accountId, tokenLedger.ds24OrderId],
      })
      .returning({ id: tokenLedger.id });

    if (inserted.length === 0) {
      return { credited: false, balance: acct.balance };
    }
    await tx
      .update(tokenAccounts)
      .set({
        balance: newBalance,
        // purchase_id nur merken, wenn noch keins hinterlegt ist.
        ...(args.linkPurchaseId && !acct.ds24PurchaseId
          ? { ds24PurchaseId: args.linkPurchaseId }
          : {}),
        ...(args.releaseReloadLock
          ? { reloadLockedAt: null, lastReloadAt: now }
          : {}),
        updatedAt: now,
      })
      .where(eq(tokenAccounts.id, acct.id));
    return { credited: true, balance: newBalance };
  });
}

/**
 * Versucht atomar, den Auto-Reload-Slot zu belegen (Lock). Nur EIN paralleler
 * Aufruf gewinnt — verhindert Doppelabbuchung. Ein veralteter Lock (Timeout)
 * wird dabei übernommen. Gibt true zurück, wenn der Lock gewonnen wurde.
 */
export async function claimReloadSlot(
  userId: string,
  buyerEmail: string,
  now: Date = new Date(),
  timeoutHours: number = RELOAD_LOCK_TIMEOUT_HOURS,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - timeoutHours * 3_600_000);
  const claimed = await db
    .update(tokenAccounts)
    .set({ reloadLockedAt: now, updatedAt: now })
    .where(
      and(
        eq(tokenAccounts.userId, userId),
        eq(tokenAccounts.buyerEmail, buyerEmail),
        eq(tokenAccounts.autoReloadEnabled, true),
        or(
          isNull(tokenAccounts.reloadLockedAt),
          lt(tokenAccounts.reloadLockedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: tokenAccounts.id });
  return claimed.length === 1;
}

/** Gibt den Reload-Lock wieder frei (z. B. wenn die Abbuchung fehlschlug). */
export async function releaseReloadSlot(
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(tokenAccounts)
    .set({ reloadLockedAt: null, updatedAt: now })
    .where(eq(tokenAccounts.id, accountId));
}

/** Auto-Reload-Einstellungen eines Kontos setzen. */
export async function setAutoReload(args: {
  userId: string;
  buyerEmail: string;
  enabled: boolean;
  threshold: number;
  packageKey: string | null;
  ds24PurchaseId: string | null;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await getOrCreateTokenAccount(args.userId, args.buyerEmail);
  await db
    .update(tokenAccounts)
    .set({
      autoReloadEnabled: args.enabled,
      autoReloadThreshold: args.threshold,
      autoReloadPackageKey: args.packageKey,
      ds24PurchaseId: args.ds24PurchaseId,
      updatedAt: now,
    })
    .where(
      and(
        eq(tokenAccounts.userId, args.userId),
        eq(tokenAccounts.buyerEmail, args.buyerEmail),
      ),
    );
}

export interface AutoReloadResult {
  triggered: boolean;
  reason?:
    | "no-account"
    | "disabled-or-above-threshold"
    | "not-configured"
    | "locked";
}

/**
 * Prüft ein Konto und stößt bei Bedarf ein Auto-Aufladen an: Lock holen →
 * createBillingOnDemand gegen die hinterlegte purchase_id. Die Gutschrift folgt
 * per IPN (der auch den Lock löst). Schlägt die Abbuchung fehl, wird der Lock
 * sofort freigegeben und der Fehler geworfen.
 *
 * Aufrufen z. B. direkt nach consumeTokens oder aus einem Cron-Job über alle
 * Konten mit niedrigem Guthaben.
 */
export async function autoReloadIfNeeded(args: {
  userId: string;
  buyerEmail: string;
  apiKey: string;
  now?: Date;
  /** Injizierbar für Tests; Default: echtes createBillingOnDemand. */
  bill?: (apiKey: string, a: BillOnDemandArgs) => Promise<unknown>;
}): Promise<AutoReloadResult> {
  const now = args.now ?? new Date();
  const acct = await getTokenAccount(args.userId, args.buyerEmail);
  if (!acct) return { triggered: false, reason: "no-account" };
  if (!shouldAutoReload(acct)) {
    return { triggered: false, reason: "disabled-or-above-threshold" };
  }
  if (!acct.autoReloadPackageKey || !acct.ds24PurchaseId) {
    return { triggered: false, reason: "not-configured" };
  }
  const claimed = await claimReloadSlot(args.userId, args.buyerEmail, now);
  if (!claimed) return { triggered: false, reason: "locked" };
  try {
    const pkg = getTokenPackage(acct.autoReloadPackageKey);
    const bill = args.bill ?? createBillingOnDemand;
    await bill(args.apiKey, {
      purchaseId: acct.ds24PurchaseId,
      productId: productId(pkg.key), // Live-Produkt-ID aus der Registry
      priceCents: pkg.priceCents,
      currency: pkg.currency,
      custom: tokenCustomMarker(pkg.key),
    });
    return { triggered: true };
  } catch (err) {
    await releaseReloadSlot(acct.id, now);
    throw err;
  }
}
