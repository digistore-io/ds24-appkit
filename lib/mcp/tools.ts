// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What this app lets an AI client DO. The whole product surface of the MCP
// server is this one list.
//
// ⚠️ THE THREE TOOLS BELOW ARE EXAMPLES. They exist so the three patterns that
// actually matter are on screen in working code — a session-scoped read, a
// plan-gated read, and a metered write that charges tokens. Replace them with
// your own; the `mcp-server` skill walks through choosing which ones are worth
// exposing and which are not.
//
// ── The four rules a tool has to satisfy ───────────────────────────────────
//
// 1. **A tool never takes a member id.** The account it acts on is `ctx.memberId`,
//    which came from the key in the Authorization header. Every argument in
//    `inputSchema` is written by a MODEL, which is reading text somebody else
//    may have authored — a `memberId` argument is an IDOR with a language model
//    holding the pen. This is the same reason `spendTokens` has no such
//    parameter (see lib/tokens/spend.ts).
//
// 2. **The price is yours, computed in code.** Never read a cost from the
//    arguments. `ctx.spend()` exists so a tool cannot name a different account;
//    what it cannot stop is a tool passing an amount the model chose.
//
// 3. **`readOnly` is a security boundary, not documentation.** A key with the
//    `read` scope may run read-only tools and nothing else, and that refusal
//    lives in `app/api/mcp/route.ts` — before the handler runs. Mark a tool
//    read-only only if it changes NOTHING: no writes, no charges, no mail, no
//    outbound calls that cost money. When in doubt it is not read-only.
//
// 4. **Access comes from the entitlement API.** `requiresPlan` is answered by
//    `hasPlan()`, never by reading a billing table. A token package cannot
//    satisfy it — a balance is not an entitlement, so `hasPlan()` answers false
//    for one for ever. `tools.test.ts` fails the build on a tool naming a
//    product that does not exist or is a token package.
//
// ── What NOT to expose ─────────────────────────────────────────────────────
// Anything an Operator does to somebody else. There is no `block_user`, no
// `adjust_balance`, no `grant_plan` here and there must not be: those are
// `requireOwner()` operations, and an Operator's key is still just a key on a
// laptop being driven by a model that reads untrusted text. The blast radius of
// a leaked customer key is that customer; the blast radius of a leaked operator
// tool is the business.
import { hasPlan, entitlementsFor, suspendedKeysFor } from "@/lib/entitlements/manage";
import { pausedKeys } from "@/lib/entitlements/rules";
import { getTokenAccount, hasSufficientBalance, listLedgerFor } from "@/lib/tokens/account";
import { findProduct } from "@/lib/digistore/products";
import { sellsTokens } from "@/lib/billing-mode";
import {
  toolData,
  toolFailure,
  type ToolCallResult,
} from "./protocol";

/**
 * What a handler gets. Everything member-scoped is already bound to the key's
 * owner — there is no parameter through which a tool could reach another
 * account.
 */
export interface ToolContext {
  /** Proven by the key in the Authorization header. Never from arguments. */
  readonly memberId: string;
  /**
   * Charges this member. Bound to `memberId` by construction — the same
   * guarantee `spendTokens` gives a Server Action, in the shape the MCP path
   * needs (there is no session here, so `spendTokens` itself cannot be used).
   *
   * Throws on a shortfall; the caller turns that into an `isError` RESULT, not
   * a JSON-RPC error — see the note on `ToolCallResult.isError`.
   */
  spend(amount: number, note: string): Promise<number>;
}

export interface McpTool {
  name: string;
  /**
   * What it does, written FOR A MODEL.
   *
   * This is the single highest-leverage string in the file. The model decides
   * whether to call the tool from this text alone, so it has to say when the
   * tool applies, not just what it is. "Returns the plans and token balance of
   * the account this key belongs to. Use it before answering anything about
   * what the user has paid for." beats "Account info."
   */
  description: string;
  /** JSON Schema for the arguments. `{}` for a tool that takes none. */
  inputSchema: Record<string, unknown>;
  /** Changes NOTHING — no writes, no charges. See rule 3 above. */
  readOnly: boolean;
  /** Product key this tool belongs to, or null for every member. */
  requiresPlan: string | null;
  /** What it costs the member per call, in tokens. 0 for free. */
  costTokens: number;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult>;
}

// ── Example 1 — a session-scoped read ───────────────────────────────────────

const accountOverview: McpTool = {
  name: "account_overview",
  description:
    "Returns the plans and prepaid token balance of the account this API key belongs to. " +
    "Call it before answering any question about what the user has access to, what they " +
    "have paid for, or whether they can afford an action.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  requiresPlan: null,
  costTokens: 0,

  async run(_args, ctx) {
    const [owned, suspended, account] = await Promise.all([
      entitlementsFor(ctx.memberId),
      suspendedKeysFor(ctx.memberId),
      getTokenAccount(ctx.memberId),
    ]);

    return toolData({
      plans: owned.map((e) => ({
        productKey: e.productKey,
        name: findProduct(e.productKey)?.name ?? e.productKey,
        source: e.source,
        // ISO, so a model does not have to parse a localised date. `accessUntil`
        // is stored as the last millisecond of a day IN UTC — rendering it in
        // any other zone reads as the following day (see lib/entitlements).
        accessUntil: e.accessUntil ? e.accessUntil.toISOString() : null,
      })),
      // A missed payment makes a plan disappear from `plans` above, which reads
      // to a customer exactly like an account closure and is not one. Saying so
      // is the whole reason this field exists — never return nothing at all.
      pausedPlans: pausedKeys(owned, suspended),
      // Hidden entirely in a subscriptions-only app, where a balance stuck at 0
      // is noise — but only while it IS zero. A mode may hide an empty thing,
      // never a non-empty one (lib/billing-mode.ts).
      ...(sellsTokens() || (account?.balance ?? 0) > 0
        ? { tokenBalance: account?.balance ?? 0 }
        : {}),
    });
  },
};

// ── Example 2 — a read behind a plan ────────────────────────────────────────

/**
 * The plan this example is gated on.
 *
 * A key from `config/digistore-products.json`. `tools.test.ts` fails the build
 * if it names a product that is not there, so deleting the sample products
 * without touching this file breaks the tests rather than the customer's first
 * call — the same deal `lib/billing-mode.test.ts` makes.
 */
const EXAMPLE_PLAN = "basis_monatlich";

const usageReport: McpTool = {
  name: "usage_report",
  description:
    "Returns this account's most recent token bookings — what was spent, on what, and " +
    "the balance after each. Use it to answer questions about where the balance went.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "How many bookings to return, newest first. Defaults to 10.",
      },
    },
    additionalProperties: false,
  },
  readOnly: true,
  requiresPlan: EXAMPLE_PLAN,
  costTokens: 0,

  async run(args, ctx) {
    // The schema says integer 1..50 and the model usually obeys it — but a
    // schema is a hint to a model, not a check. Every argument is re-validated
    // here, exactly as a Server Action re-validates a form.
    const raw = args.limit;
    const limit =
      typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 50 ? raw : 10;

    const rows = await listLedgerFor(ctx.memberId, limit);

    return toolData({
      bookings: rows.map((row) => ({
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balanceAfter,
        // `note` is an operator/system label and reaches a subject access
        // request; it is the member's own data and they may read it.
        note: row.note,
        at: row.createdAt.toISOString(),
      })),
      returned: rows.length,
      // Say so rather than presenting a slice as the whole story.
      truncated: rows.length === limit,
    });
  },
};

// ── Example 3 — a write that costs the member something ─────────────────────

/** What one `summarize_text` call costs. In code, never in the arguments. */
const SUMMARIZE_COST = 5;

const summarizeText: McpTool = {
  name: "summarize_text",
  description:
    "Analyses a piece of text and returns its structure (characters, words, sentences, " +
    `longest sentence). Costs ${SUMMARIZE_COST} tokens from this account's balance per call.`,
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        maxLength: 20_000,
        description: "The text to analyse.",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  // Not read-only: it charges. Anything that moves money is a write, even when
  // it reads nothing — see rule 3.
  readOnly: false,
  requiresPlan: null,
  costTokens: SUMMARIZE_COST,

  async run(args, ctx) {
    const text = typeof args.text === "string" ? args.text : "";
    if (text.trim() === "") {
      return toolFailure("The 'text' argument is required and must not be empty.");
    }
    if (text.length > 20_000) {
      return toolFailure("The 'text' argument is longer than the 20000 character limit.");
    }

    // CHECK → WORK → CHARGE, in that order, and the order is the point.
    //
    // Charging first bills for work that then fails. Doing the work with no
    // check in front gives the result away for free, because by the time
    // `spend()` throws the expensive part has already run — and that is the
    // mistake that actually gets made. The gap between the check and the charge
    // is real but bounded at one operation, and the row lock inside
    // `consumeTokens` still stops a balance going negative.
    const account = await getTokenAccount(ctx.memberId);
    if (!hasSufficientBalance(account?.balance ?? 0, SUMMARIZE_COST)) {
      // An `isError` RESULT, not a JSON-RPC error: the model is meant to read
      // this, tell the user they are out of balance and stop — not retry the
      // identical call, which is what an opaque protocol error produces.
      return toolFailure(
        `Not enough tokens: this call costs ${SUMMARIZE_COST} and the balance is ` +
          `${account?.balance ?? 0}. The user can top up in the app under Plans.`,
      );
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const balanceLeft = await ctx.spend(
      SUMMARIZE_COST,
      // A LABEL, never the content. This string reaches a subject access
      // request (`node run.mjs data-export`, docs/data-protection.md), so it
      // says what was charged for and not what the member submitted.
      "mcp: summarize_text",
    );

    return toolData({
      characters: text.length,
      words: words.length,
      sentences: sentences.length,
      longestSentence: sentences.reduce((a, b) => (b.length > a.length ? b : a), ""),
      charged: SUMMARIZE_COST,
      balanceLeft,
    });
  },
};

// ── The registry ────────────────────────────────────────────────────────────

/**
 * Every tool this server offers. Order is the order clients display them in.
 *
 * Frozen so nothing can push a tool onto it at runtime. That is not paranoia
 * about this codebase — it is what makes `capabilities.tools.listChanged: false`
 * in `initializeResult()` a true statement rather than a hopeful one.
 */
export const TOOLS: readonly McpTool[] = Object.freeze([
  accountOverview,
  usageReport,
  summarizeText,
]);

export function findTool(name: string): McpTool | null {
  return TOOLS.find((tool) => tool.name === name) ?? null;
}

/** The `tools/list` payload — the public shape of each tool. */
export function toolListPayload() {
  return {
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      // The protocol's own hints. `readOnlyHint` is exactly that — a HINT to
      // the client, which may use it to skip a confirmation prompt. It is not
      // the enforcement; that is the scope check in the route.
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: false,
        openWorldHint: false,
      },
    })),
  };
}

/**
 * The tools a given member may actually call right now.
 *
 * Used to FILTER `tools/list`, so a model is not shown a tool it will be
 * refused — a listed-but-unusable tool produces a failed call and a confused
 * answer. The refusal itself still lives in the call path: hiding a tool from
 * a list is cosmetics, and the caller may name any string it likes.
 */
export async function toolsFor(
  memberId: string,
  scope: "read" | "write",
): Promise<McpTool[]> {
  const allowed: McpTool[] = [];
  for (const tool of TOOLS) {
    if (scope === "read" && !tool.readOnly) continue;
    if (tool.requiresPlan && !(await hasPlan(memberId, tool.requiresPlan))) continue;
    allowed.push(tool);
  }
  return allowed;
}
