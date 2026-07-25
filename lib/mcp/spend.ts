// Charging a Member for an MCP tool call.
//
// ── Why this is not `spendTokens` ──────────────────────────────────────────
// `spendTokens` (lib/tokens/spend.ts) opens with `requireActiveUser()`, and
// there is no session on this path: an MCP request arrives with a bearer key
// and no cookie. Calling it here would consult `auth()`, find nothing, and
// `redirect("/login")` — which inside a route handler produces a redirect
// response to an HTML page as the answer to a JSON-RPC call.
//
// So it is a new function, and its name says what proved the authority: a KEY.
// That is exactly the shape `spendTokens` prescribes for this case rather than
// the one it forbids —
//
//     ⛔ spendTokens({ memberId?, amount })   an optional id defaulting to the
//                                            session: the IDOR compiles again
//     ✅ spendForKey({ memberId, amount })    the caller must have authenticated
//                                            a key, and the name says so
//
// ── The one rule for calling it ────────────────────────────────────────────
// **`memberId` comes from `authenticate()` and from nowhere else.** Never from
// a tool's arguments, never from the request body, never from a header the
// client controls. `lib/mcp/tools.ts` is what makes that structural: a handler
// is handed `ctx.spend(amount, note)`, already bound, and has no parameter
// through which it could name somebody else.
import { consumeTokens } from "@/lib/tokens/account";
import { isSpendableAmount, scheduleTopUp, spendErrorFor } from "@/lib/tokens/spend";
import { MAX_TOKEN_AMOUNT } from "@/lib/tokens/rules";

/**
 * Charges the member a key belongs to. Returns the balance that is left.
 *
 * Throws `TokenError("insufficientBalance")` on a shortfall, having written
 * NOTHING — no balance change, no ledger row. The tool layer turns that into an
 * `isError` result the model can read, not a JSON-RPC error (see
 * `lib/mcp/protocol.ts`).
 *
 * Not idempotent, exactly like `spendTokens`: a client that retries a failed
 * call charges twice. There is no key to deduplicate on. A model retrying on
 * its own is a real possibility here in a way it is not behind a form button,
 * which is why every tool checks the balance BEFORE doing the work and why the
 * refusal text tells the model to stop rather than to try again.
 */
export async function spendForKey(args: {
  memberId: string;
  amount: number;
  note: string;
}): Promise<number> {
  if (!isSpendableAmount(args.amount)) {
    // A plain Error, not a TokenError: the app computed this price, so it is a
    // bug in YOUR pricing rather than something the member did. It belongs in
    // `node run.mjs logs`, not in a sentence handed to a model.
    throw new Error(
      `spendForKey: ${args.amount} is not a legal price (whole, > 0, <= ${MAX_TOKEN_AMOUNT}).`,
    );
  }

  let balance: number;
  try {
    balance = await consumeTokens({
      memberId: args.memberId,
      amount: args.amount,
      note: args.note,
    });
  } catch (err) {
    const mapped = spendErrorFor(err);
    if (mapped) {
      // A shortfall is the strongest signal a top-up is due — and the one case
      // that would otherwise never trigger one, because the throw leaves before
      // the trigger below runs. Same fix as in `spendTokens`.
      scheduleTopUp(args.memberId);
      throw mapped;
    }
    throw err;
  }

  scheduleTopUp(args.memberId);
  return balance;
}
