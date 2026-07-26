// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The MCP endpoint — this app, as a tool an AI client can use.
//
// One route, POST only. What it can do is `lib/mcp/tools.ts`; how the wire
// format works is `lib/mcp/protocol.ts`; who is calling is `lib/mcp/keys.ts`.
// The full reference, including how a customer connects a client to it, is
// **`docs/mcp.md`**.
//
// ── It guards itself, and it has to ────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` and nothing else, so everything under
// `app/api/` is PUBLIC until it protects itself — the same starting position
// `app/api/chat/route.ts` is in. The order of the checks below is not
// cosmetic; each is cheaper than the one after it, and the ones that touch the
// database come after the ones that do not:
//
//   right origin?  →  feature on?  →  protocol version we speak?
//                  →  under the failed-auth limit?  →  valid key?
//                  →  under the call limit?  →  plan held?  →  scope allows it?
//                  →  run the tool
//
// ── Why there is no OAuth here ─────────────────────────────────────────────
// The MCP spec makes authorization OPTIONAL and its OAuth 2.1 profile is what
// you implement if you want a client to sign a user in on its own. This app
// authenticates with a per-member key instead (`Authorization: Bearer ds24mcp_…`),
// which every MCP client can send and which needs no authorization server, no
// consent screen and no token rotation to go wrong. The trade and the upgrade
// path are written down in `docs/mcp.md` — read it before deciding this needs
// to change.
//
// Because there is no OAuth, the 401 below deliberately carries NO
// `resource_metadata` parameter and this app serves no
// `/.well-known/oauth-protected-resource`. Advertising an authorization server
// that does not exist sends every well-behaved client on a discovery attempt
// that ends in a 404 instead of showing the user "paste your key".
import { after } from "next/server";

import { isLimited, record } from "@/lib/rate-limit";
import { hasPlan } from "@/lib/entitlements/manage";
import { APP_NAME } from "@/lib/app";
import { authenticate } from "@/lib/mcp/keys";
import { isMcpEnabled, mcpConfig } from "@/lib/mcp/config";
import { spendForKey } from "@/lib/mcp/spend";
import { TokenError } from "@/lib/tokens/rules";
import {
  ASSUMED_VERSION,
  PROTOCOL_VERSION,
  RPC_INTERNAL_ERROR,
  RPC_INVALID_PARAMS,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
  initializeResult,
  isSupportedVersion,
  parseMessage,
  rpcError,
  rpcResult,
  toolFailure,
  type RpcId,
  type ToolCallResult,
} from "@/lib/mcp/protocol";
import {
  AUTH_FAIL_BUCKET,
  AUTH_FAIL_LIMIT,
  CALL_LIMIT,
  MCP_RATE_BUCKET,
  mayRun,
} from "@/lib/mcp/rules";
import { findTool, toolsFor, type ToolContext } from "@/lib/mcp/tools";

// The tool handlers reach the database through `postgres`, which is a Node
// client — the edge runtime cannot run it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shown to clients in `initialize`. */
const SERVER_VERSION = "1.0.0";

// ── Small helpers ───────────────────────────────────────────────────────────

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/**
 * The one answer to every kind of "no key".
 *
 * Unknown, expired, revoked and blocked all produce THIS — identical status,
 * identical body. The distinction exists in `authenticate()` for the server
 * log, where it separates "somebody is guessing" from "a customer's key ran
 * out". Handing it to the caller would make this endpoint an oracle for which
 * keys exist.
 */
function unauthorized(): Response {
  return json(
    rpcError(null, RPC_INVALID_REQUEST, "Unauthorized: a valid API key is required."),
    401,
    // No `resource_metadata` — see the note at the top of this file.
    { "www-authenticate": `Bearer realm="${APP_NAME} MCP", error="invalid_token"` },
  );
}

/**
 * Where a browser is allowed to call this from.
 *
 * The spec makes this check a MUST, and the attack it stops is DNS rebinding: a
 * page on the open internet resolving a name to 127.0.0.1 and then talking to
 * an MCP server on the visitor's own machine. A real MCP client sends no
 * `Origin` at all, so an absent header is fine — a PRESENT and foreign one is
 * what gets refused.
 */
function originAllowed(origin: string | null): boolean {
  if (!origin) return true;

  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;

  const configured = process.env.APP_URL?.trim();
  if (!configured) return false;
  try {
    return new URL(configured).hostname === host;
  } catch {
    return false;
  }
}

/** The caller's origin for the failed-auth counter. Behind a proxy, the real one. */
function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  // The left-most entry is the client; everything after it was added by a hop.
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;
  const value = rest.join("");
  return value === "" ? null : value;
}

// ── GET / DELETE ────────────────────────────────────────────────────────────

/**
 * 405, and that is the correct answer rather than a gap.
 *
 * A GET to the MCP endpoint asks to open a server-to-client SSE stream. This
 * server never initiates anything — it answers tool calls and stops — and the
 * spec names 405 as what a server without such a stream returns. A client reads
 * it and simply does not try again.
 */
export async function GET(): Promise<Response> {
  return json(
    rpcError(null, RPC_INVALID_REQUEST, "This MCP server does not offer a server-initiated stream."),
    405,
    { allow: "POST" },
  );
}

/** Session termination. There are no sessions here — see lib/mcp/protocol.ts. */
export async function DELETE(): Promise<Response> {
  return json(
    rpcError(null, RPC_INVALID_REQUEST, "This MCP server is stateless; there is no session to end."),
    405,
    { allow: "POST" },
  );
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  // 1. DNS-rebinding guard. First because it is a string comparison and because
  //    a request from the wrong place should not reach the key lookup at all.
  if (!originAllowed(request.headers.get("origin"))) {
    return json(rpcError(null, RPC_INVALID_REQUEST, "Origin not allowed."), 403);
  }

  // 2. Is the feature on at all? Cheap, and it is the answer for an app that
  //    ships with the MCP server switched off — which this template does.
  if (!isMcpEnabled()) {
    return json(
      rpcError(null, RPC_INVALID_REQUEST, "This app does not offer an MCP interface."),
      404,
    );
  }

  // 3. A version we actually speak. The header is absent on the very first
  //    request by design — the spec's own fallback covers that.
  const version = request.headers.get("mcp-protocol-version") ?? ASSUMED_VERSION;
  if (!isSupportedVersion(version)) {
    return json(
      rpcError(
        null,
        RPC_INVALID_REQUEST,
        `Unsupported MCP-Protocol-Version "${version}". This server speaks ${PROTOCOL_VERSION}.`,
      ),
      400,
    );
  }

  // 4. Who is asking. Metered by origin BEFORE the lookup, so a script trying
  //    keys costs itself rather than the database.
  const caller = callerKey(request);
  if (isLimited(AUTH_FAIL_BUCKET, caller, AUTH_FAIL_LIMIT)) return unauthorized();

  const bearer = bearerFrom(request);
  if (!bearer) {
    record(AUTH_FAIL_BUCKET, caller, AUTH_FAIL_LIMIT);
    return unauthorized();
  }

  const auth = await authenticate(bearer);
  if (!auth.ok) {
    record(AUTH_FAIL_BUCKET, caller, AUTH_FAIL_LIMIT);
    // Precise in the log, vague to the caller — see `unauthorized()`.
    console.warn(`[mcp] rejected a key from ${caller}: ${auth.reason}`);
    return unauthorized();
  }

  const { memberId, scope } = auth;

  // 5. The runaway brake, per member across all their keys.
  if (isLimited(MCP_RATE_BUCKET, memberId, CALL_LIMIT)) {
    return json(
      rpcError(null, RPC_INVALID_REQUEST, "Too many requests. Try again in a minute."),
      429,
      { "retry-after": "60" },
    );
  }
  record(MCP_RATE_BUCKET, memberId, CALL_LIMIT);

  // 6. May THIS member use the interface at all? `hasPlan` reads `grants` —
  //    never a billing table. `requiresPlan: null` means every member may.
  const config = mcpConfig();
  if (config.requiresPlan && !(await hasPlan(memberId, config.requiresPlan))) {
    return json(
      rpcError(null, RPC_INVALID_REQUEST, "This account's plan does not include the MCP interface."),
      403,
    );
  }

  // 7. The body is whatever the caller posted.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, RPC_PARSE_ERROR, "Body is not valid JSON."), 400);
  }

  const parsed = parseMessage(body);

  if (parsed.kind === "invalid") {
    return json(rpcError(parsed.id, RPC_INVALID_REQUEST, parsed.message), 400);
  }

  // A notification gets 202 and NO body — the spec is explicit, and a client
  // that receives a JSON-RPC response to a notification it never gave an id
  // has nothing to match it against. `notifications/initialized` is the one
  // every client sends.
  if (parsed.kind === "notification") {
    return new Response(null, { status: 202 });
  }

  const { id, method, params } = parsed.message;

  try {
    switch (method) {
      case "initialize":
        return json(
          rpcResult(
            id,
            initializeResult({
              clientVersion:
                typeof params?.protocolVersion === "string" ? params.protocolVersion : undefined,
              server: {
                name: config.serverName,
                version: SERVER_VERSION,
                ...(process.env.APP_URL ? { websiteUrl: process.env.APP_URL } : {}),
              },
              instructions: config.instructions || undefined,
            }),
          ),
        );

      case "ping":
        // Defined to return an empty result. Clients use it as a keep-alive.
        return json(rpcResult(id, {}));

      case "tools/list": {
        // Filtered to what this key may actually run, so a model is never shown
        // a tool it will be refused. The refusal still lives in `tools/call`.
        const tools = await toolsFor(memberId, scope);
        return json(
          rpcResult(id, {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: {
                readOnlyHint: tool.readOnly,
                destructiveHint: false,
                openWorldHint: false,
              },
            })),
          }),
        );
      }

      case "tools/call":
        return await callTool({ id, params, memberId, scope });

      default:
        return json(rpcError(id, RPC_METHOD_NOT_FOUND, `Unknown method "${method}".`));
    }
  } catch (error) {
    // Deliberately vague towards the caller, precise in the log. A stack trace
    // reaching a model is a stack trace reaching whoever is talking to it.
    console.error(`[mcp] ${method} failed:`, error);
    return json(rpcError(id, RPC_INTERNAL_ERROR, "The tool call failed."), 500);
  }
}

// ── tools/call ──────────────────────────────────────────────────────────────

async function callTool(args: {
  id: RpcId;
  params: Record<string, unknown> | undefined;
  memberId: string;
  scope: "read" | "write";
}): Promise<Response> {
  const name = args.params?.name;
  if (typeof name !== "string") {
    return json(rpcError(args.id, RPC_INVALID_PARAMS, 'Missing "name".'));
  }

  const tool = findTool(name);
  // A JSON-RPC error, not an `isError` result: "there is no such tool" is a
  // statement about the REQUEST, and a model should stop rather than rephrase.
  if (!tool) {
    return json(rpcError(args.id, RPC_METHOD_NOT_FOUND, `Unknown tool "${name}".`));
  }

  // THE scope check. In the call path and not merely in the listing: a caller
  // may name any tool it likes, and `tools/list` hiding one is cosmetics.
  if (!mayRun(args.scope, tool.readOnly)) {
    return json(
      rpcResult(
        args.id,
        toolFailure(
          `This API key is read-only, and "${name}" changes data. ` +
            `Create a key with write access in the app under Account if this is intended.`,
        ),
      ),
    );
  }

  // The per-tool plan gate, for the same reason: listed or not, the refusal
  // has to be here. `hasPlan` reads `grants`, never a billing table.
  if (tool.requiresPlan && !(await hasPlan(args.memberId, tool.requiresPlan))) {
    return json(
      rpcResult(
        args.id,
        toolFailure(
          `"${name}" needs a plan this account does not currently hold. ` +
            `The user can see and change that in the app under Plans.`,
        ),
      ),
    );
  }

  const toolArgs =
    typeof args.params?.arguments === "object" &&
    args.params.arguments !== null &&
    !Array.isArray(args.params.arguments)
      ? (args.params.arguments as Record<string, unknown>)
      : {};

  // The context is built HERE, bound to the authenticated member. A handler
  // gets no way to name a different account — see lib/mcp/tools.ts, rule 1.
  const ctx: ToolContext = {
    memberId: args.memberId,
    spend: (amount, note) => spendForKey({ memberId: args.memberId, amount, note }),
  };

  let result: ToolCallResult;
  try {
    result = await tool.run(toolArgs, ctx);
  } catch (error) {
    // A shortfall is a RESULT the model is meant to read and act on, not a
    // protocol error — see the note on `ToolCallResult.isError`. Everything
    // else is ours and is rethrown into the 500 above.
    if (error instanceof TokenError) {
      result = toolFailure(
        "Not enough tokens on this account for that call. The user can top up in the app under Plans.",
      );
    } else {
      throw error;
    }
  }

  // Usage is worth one line per call in `node run.mjs logs` — it is how an
  // operator sees which tools are actually used, and the first thing to look at
  // when a bill surprises somebody. No arguments and no results: those are the
  // member's content.
  after(() =>
    console.info(`[mcp] tool=${name} member=${args.memberId} cost=${tool.costTokens}`),
  );

  return json(rpcResult(args.id, result));
}
