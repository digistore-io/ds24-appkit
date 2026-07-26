// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The Member's own view of their token journal — the reader behind the
// "Tokens" tab on /dashboard/billing.
//
// ── Why this is not `listLedgerFor` with a different caller ─────────────────
// `listLedgerFor` (./account.ts) is the OPERATOR's read. It returns `note`, and
// `note` carries three different things depending on the row:
//
//   adjust  — what an Operator typed ABOUT this customer, for a colleague
//             ("goodwill, do not repeat"). Never theirs to read.
//   topup   — a hard-coded GERMAN system string (payment-event.ts, claim.ts).
//             Not translated, so not showable to an English reader.
//   consume — the app's own label from `spendTokens({ note })`
//             ("report generation"). This one IS the Member's information.
//
// So the Member's shape carries no `note` field at all. It carries a `label`,
// and `memberLedgerLabel` below decides — deny by default — which rows get one.
//
// `lib/entitlements/leak-guard.test.ts` forbids Member surfaces from touching
// `note`/`issuedBy` or calling `listLedgerFor`, and names a Member-facing
// history as exactly the thing it exists to prevent. This module is how that
// history gets built without weakening the guard: the filtering happens here,
// in one pure function with a test per row type, instead of as a condition
// buried in JSX.
import { db } from "@/db";
import { tokenAccounts, tokenLedger } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/** How many bookings the Member's tab asks for at once. */
export const OWN_LEDGER_PAGE_SIZE = 100;

/** Just enough of a ledger row to decide whether its note may be shown. */
export interface OwnLedgerSource {
  type: "topup" | "consume" | "refund" | "adjust";
  note: string | null;
}

/** One booking as the MEMBER reads it. Deliberately has no `note` field. */
export interface OwnLedgerRow {
  id: string;
  type: "topup" | "consume" | "refund" | "adjust";
  /** SIGNED: + for topup/refund/upward adjust, − for consume. */
  amount: number;
  balanceAfter: number;
  /** What the app charged for — `null` unless this is a consume row. */
  label: string | null;
  /** "sub" | "topup" | "auto" — how a crediting purchase was initiated. */
  origin: string | null;
  createdAt: Date;
}

/**
 * Does the Member's billing page carry a "Tokens" tab?
 *
 * Pure, because it is a DECISION and the interesting half of it is the half
 * that is easy to drop. `sellsTokens` alone is wrong: `billingMode` is a
 * display setting somebody flips on a live app (`lib/billing-mode.ts`), and a
 * mode **may hide an empty thing, never a non-empty one**. A Member holding a
 * paid balance keeps their tab after a switch — hiding it would turn a layout
 * change into a support case.
 *
 * `ledgerCount` is not redundant beside `balance`: a Member who spent down to
 * exactly 0 still has a history worth reading, and `balance !== 0` alone would
 * hide it the moment it mattered most.
 *
 * Note what is NOT here: the existence of a `token_accounts` row. One appears
 * on the first `getOrCreateTokenAccount`, which a since-reverted correction is
 * enough to trigger, so `Boolean(account)` would keep the tab on screen for
 * accounts that never held a single token.
 */
export function shouldShowTokenTab(args: {
  sellsTokens: boolean;
  balance: number;
  ledgerCount: number;
  /** Auto top-up is armed — the tab holds the only switch that stops it. */
  autoReloadEnabled?: boolean;
}): boolean {
  return (
    args.sellsTokens ||
    args.balance !== 0 ||
    args.ledgerCount > 0 ||
    // Load-bearing, and the one that is easy to leave out: an armed account
    // with a zero balance and an empty ledger in an app that has stopped
    // selling tokens would otherwise render NO tab — and the off switch lives
    // on it. That is an unattended card charge the Member cannot stop.
    Boolean(args.autoReloadEnabled)
  );
}

/**
 * May this row's note be shown to the Member it belongs to?
 *
 * **Deny by default.** Only `consume` is allowed, and the check returns `null`
 * for anything else — including a `tokenLedgerTypeEnum` member that does not
 * exist yet. An allow-list written the other way round (`type !== "adjust"`)
 * would make every future row type visible by omission, which is the failure
 * nobody notices.
 *
 * ⛔ **The one way to break this is to write a `consume` row on the Member's
 * behalf.** `consume` notes are shown BECAUSE only `spendTokens` writes them,
 * and what it writes is the app's own label ("report generation"). An Operator
 * tool that called `consumeTokens({ memberId, note })` from the admin pages —
 * "deduct tokens, reason: …" — would put that reason verbatim on the customer's
 * own billing tab. An Operator taking tokens away uses `adjustTokens` with a
 * negative amount, which books an `adjust` row and stays hidden. If a
 * Member-visible consume note ever has to carry operator text, it needs its own
 * column, not this one.
 */
export function memberLedgerLabel(row: OwnLedgerSource): string | null {
  return row.type === "consume" ? (row.note ?? null) : null;
}

/**
 * The Member's own bookings, newest first.
 *
 * An `innerJoin` over `token_accounts` rather than looking the account id up
 * first: a Member who never bought tokens HAS no account row, and a join simply
 * yields nothing where a two-step read would have to handle the `undefined`.
 * Same reasoning as `listLedgerFor`.
 *
 * `id` as the tiebreak on `created_at` is load-bearing — `created_at` defaults
 * to `now()`, which in Postgres is the TRANSACTION timestamp, so several
 * credits booked in one transaction share it exactly and would otherwise come
 * back in whatever order the planner felt like, differently on each load.
 *
 * Capped: an account consuming per request has an unbounded number of rows. The
 * caller is told it hit the cap (`rows.length === limit`) so it can say so
 * rather than present a slice as the whole story.
 */
export async function listOwnLedger(
  memberId: string,
  limit: number = OWN_LEDGER_PAGE_SIZE,
): Promise<OwnLedgerRow[]> {
  const take = Math.max(1, Math.trunc(limit));
  const rows = await db
    .select({
      id: tokenLedger.id,
      type: tokenLedger.type,
      amount: tokenLedger.amount,
      balanceAfter: tokenLedger.balanceAfter,
      // Read here, and deliberately NOT passed through — see the mapping below.
      // `issuedBy` is not selected at all: the Member has no business knowing
      // which Operator touched their balance.
      rawNote: tokenLedger.note,
      origin: tokenLedger.origin,
      createdAt: tokenLedger.createdAt,
    })
    .from(tokenLedger)
    .innerJoin(tokenAccounts, eq(tokenLedger.accountId, tokenAccounts.id))
    .where(eq(tokenAccounts.memberId, memberId))
    .orderBy(desc(tokenLedger.createdAt), desc(tokenLedger.id))
    .limit(take);

  return rows.map(({ rawNote, ...row }) => ({
    ...row,
    label: memberLedgerLabel({ type: row.type, note: rawNote }),
  }));
}
