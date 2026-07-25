// The MCP server — is it there at all, and who may reach it.
//
// One switch, not two. The assistant needs `config/ai-chat.json` AND an
// `ANTHROPIC_API_KEY` because she calls an API somebody pays for; this server
// calls nothing outward. It answers questions about the app, so there is no
// machine-level prerequisite and nothing to configure per environment — the
// only question is whether this PRODUCT offers an MCP interface.
//
// ── It ships OFF, and that is the security decision ────────────────────────
// Every other optional feature in this template ships on and does nothing
// useful until configured. This one ships off, because "does nothing useful"
// is not what an unconfigured MCP server does — it exposes whatever tools are
// in `lib/mcp/tools.ts` to anyone holding a key, and the tools it ships with
// are EXAMPLES meant to be replaced. Turning it on is the moment somebody has
// decided what their app should expose, which is exactly what the `mcp-server`
// skill walks through.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Server components, Server Actions, route handlers. NOT a client component:
// it imports the product registry to validate `requiresPlan`, and prices and
// Digistore24 product ids have no business in a browser bundle — the same rule
// `lib/billing-mode.ts` and `lib/ai/chat-config.ts` follow.
import raw from "@/config/mcp.json";
import { allProducts } from "@/lib/digistore/products";

export interface McpConfig {
  enabled: boolean;
  /**
   * What this server calls itself in `initialize`.
   *
   * Clients show it in their connector list, so it is the name a customer sees
   * next to their key. A proper noun — NOT translated, like `APP_NAME`.
   */
  serverName: string;
  /** Product key the MCP interface belongs to, or null for every member. */
  requiresPlan: string | null;
  /**
   * Optional guidance handed to the model on `initialize`.
   *
   * The protocol's own field for "how should a model use this server". Worth
   * writing: it is the difference between a model that knows your tools are
   * about invoices and one that guesses. Empty is fine — the tool descriptions
   * carry most of the weight.
   */
  instructions: string;
}

export const DEFAULT_MCP_CONFIG: McpConfig = {
  // Off. See the note at the top of this file — an unreadable config must not
  // resolve to an open endpoint.
  enabled: false,
  serverName: "ds24-appkit",
  requiresPlan: null,
  instructions: "",
};

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/** The configured server, with every unreadable field replaced by its default. */
export function mcpConfig(): McpConfig {
  const file = raw as Record<string, unknown>;
  const requiresPlan = file.requiresPlan;

  return {
    enabled: file.enabled === true,
    serverName: str(file.serverName, DEFAULT_MCP_CONFIG.serverName),
    requiresPlan:
      typeof requiresPlan === "string" && requiresPlan.trim() !== ""
        ? requiresPlan.trim()
        : null,
    instructions: typeof file.instructions === "string" ? file.instructions.trim() : "",
  };
}

/**
 * Everything wrong with the shipped config — empty when it is coherent.
 *
 * `lib/mcp/config.test.ts` fails the build on a non-empty result. The point is
 * that a `requiresPlan` naming a product that does not exist is caught here,
 * at build time, and not by `hasPlan()` throwing "unknown product key" against
 * a customer's first tool call — where the error reaches a model, not a person.
 */
export function mcpConfigProblems(): string[] {
  const config = mcpConfig();
  const problems: string[] = [];
  const file = raw as Record<string, unknown>;

  if (file.enabled !== undefined && typeof file.enabled !== "boolean") {
    problems.push('"enabled" must be true or false');
  }

  if (config.requiresPlan !== null) {
    const plan = allProducts().find((p) => p.key === config.requiresPlan);
    if (!plan) {
      problems.push(
        `"requiresPlan": no product "${config.requiresPlan}" in config/digistore-products.json`,
      );
    } else if (plan.kind === "token") {
      // The same refusal `ai-chat.json` gets, and for the same reason: a
      // balance is not an entitlement, so `hasPlan()` answers false for a token
      // package for ever. Gating on one locks out the customers who paid.
      problems.push(
        `"requiresPlan": "${config.requiresPlan}" is a token package — a balance is not an entitlement, so hasPlan() answers false for it for ever`,
      );
    }
  }

  return problems;
}

/**
 * Is the MCP server live on this installation?
 *
 * This answers "is the feature there", NOT "may this person use it". The second
 * question is `requiresPlan` plus `hasPlan(memberId, productKey)` from
 * `lib/entitlements/manage.ts`, asked per member on every call — see
 * `app/api/mcp/route.ts`.
 */
export function isMcpEnabled(): boolean {
  return mcpConfig().enabled && mcpConfigProblems().length === 0;
}

/** Why it is off — for the notice on the account page. `null` when it is on. */
export type McpOffReason = "disabledInConfig" | "brokenConfig";

export function mcpOffReason(): McpOffReason | null {
  if (!mcpConfig().enabled) return "disabledInConfig";
  if (mcpConfigProblems().length > 0) return "brokenConfig";
  return null;
}
