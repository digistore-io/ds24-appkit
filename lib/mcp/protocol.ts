// The wire format: JSON-RPC 2.0 as the Model Context Protocol uses it.
//
// Pure. Nothing here reads a database, a session or a request — it turns bytes
// into a parsed message and a result into bytes, so `app/api/mcp/route.ts` is
// left with the part that needs the world (who is asking, may they, what does
// it cost). `protocol.test.ts` covers this file case by case.
//
// ── Why this is written out and not an SDK ─────────────────────────────────
// The official `@modelcontextprotocol/sdk` exists and is good. This template
// does not use it, for the same reason it hashes with `node:crypto` instead of
// `bcrypt`: the surface actually needed here is `initialize`, `tools/list`,
// `tools/call` and `ping` over one POST route — about two hundred lines,
// versus a dependency on the request path of an endpoint that carries customer
// credentials, in an app whose owner is usually not a developer and will not be
// tracking its releases. If this server ever grows resources, prompts,
// sampling or server-initiated requests, that trade flips; take the SDK then.
//
// ── What is deliberately NOT implemented ───────────────────────────────────
//  - **Sessions.** The spec makes `Mcp-Session-Id` optional and this server
//    does without: every request carries its own key and is answered on its
//    own. That is what lets the app run behind a load balancer, or on a hoster
//    that starts a fresh process per request, with no shared state to lose —
//    and it is the direction the protocol itself is moving (the 2026-07-28
//    revision removes protocol-level sessions outright).
//  - **SSE.** A request is answered with one `application/json` body, which the
//    spec allows and every client must support. Streaming exists so a server
//    can send progress and server-initiated requests during a long call; a tool
//    here answers in milliseconds.
//  - **The GET stream.** `app/api/mcp/route.ts` answers 405, which the spec
//    names as the correct answer for a server that offers no server-initiated
//    stream.

/**
 * The protocol revision this server implements.
 *
 * ⚠️ Do not bump this to whatever is newest without reading the changes.
 * Claiming a version is a promise about behaviour: the 2026-07-28 revision
 * requires an `Mcp-Method` header on every request and removes sessions and the
 * GET stream, so a server that answers `2026-07-28` while behaving like this
 * one is lying to its clients. See `docs/mcp.md`.
 */
export const PROTOCOL_VERSION = "2025-11-25";

/**
 * Revisions this server will speak if a client asks for one.
 *
 * All three negotiate to the same behaviour here — this server uses no feature
 * that changed between them. A client asking for something else is answered
 * with `PROTOCOL_VERSION` and decides for itself whether it can live with that,
 * which is what the spec's version negotiation is for.
 */
export const SUPPORTED_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

/**
 * What a client that sends no `MCP-Protocol-Version` header is assumed to be.
 *
 * The spec names this exact fallback. It matters because the header is required
 * only on requests AFTER initialization, so the very first POST legitimately
 * arrives without one.
 */
export const ASSUMED_VERSION = "2025-03-26";

export function isSupportedVersion(value: string): boolean {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(value);
}

// ── JSON-RPC shapes ─────────────────────────────────────────────────────────

/** A JSON-RPC id. `null` is legal on the wire and means "no id". */
export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: "2.0";
  id: RpcId;
  method: string;
  params?: Record<string, unknown>;
}

/** A notification is a request with no id — it gets no response, ever. */
export interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

/** The standard codes, plus the one MCP adds. */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export interface RpcErrorBody {
  jsonrpc: "2.0";
  id: RpcId;
  error: { code: number; message: string; data?: unknown };
}

export interface RpcResultBody {
  jsonrpc: "2.0";
  id: RpcId;
  result: unknown;
}

export function rpcResult(id: RpcId, result: unknown): RpcResultBody {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: RpcId,
  code: number,
  message: string,
  data?: unknown,
): RpcErrorBody {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export type Parsed =
  | { kind: "request"; message: RpcRequest }
  | { kind: "notification"; message: RpcNotification }
  | { kind: "invalid"; id: RpcId; message: string };

/**
 * Turns an already-JSON-parsed body into one of three things.
 *
 * The distinction between a request and a notification is the whole reason this
 * function exists rather than a type cast: they are answered differently — a
 * request gets a body, a notification gets `202 Accepted` and nothing else —
 * and getting that backwards makes a client wait for a response that will never
 * come, or discard one it did not expect.
 *
 * A BATCH (a JSON array) is refused. The 2025-06-18 revision removed batching
 * from the spec, and accepting it here would mean carrying a shape no current
 * client sends.
 */
export function parseMessage(body: unknown): Parsed {
  if (Array.isArray(body)) {
    return {
      kind: "invalid",
      id: null,
      message: "Batch requests are not supported.",
    };
  }
  if (typeof body !== "object" || body === null) {
    return { kind: "invalid", id: null, message: "Body must be a JSON object." };
  }

  const raw = body as Record<string, unknown>;

  // The id is read BEFORE the body is validated, so a malformed request can
  // still be answered with the id it came in with. An error carrying `id: null`
  // is one the client cannot match to the call it made.
  const id: RpcId =
    typeof raw.id === "string" || typeof raw.id === "number" ? raw.id : null;

  if (raw.jsonrpc !== "2.0") {
    return { kind: "invalid", id, message: 'Field "jsonrpc" must be "2.0".' };
  }
  if (typeof raw.method !== "string" || raw.method === "") {
    return { kind: "invalid", id, message: 'Field "method" must be a string.' };
  }

  const params =
    typeof raw.params === "object" && raw.params !== null && !Array.isArray(raw.params)
      ? (raw.params as Record<string, unknown>)
      : undefined;

  // No id at all → a notification. Note this is "the key is absent", not "the
  // id is null": a request that explicitly sent `"id": null` is still a
  // request, and answering it with 202 would hang the caller.
  if (!("id" in raw)) {
    return { kind: "notification", message: { jsonrpc: "2.0", method: raw.method, params } };
  }

  return {
    kind: "request",
    message: { jsonrpc: "2.0", id, method: raw.method, params },
  };
}

// ── initialize ──────────────────────────────────────────────────────────────

export interface ServerInfo {
  name: string;
  version: string;
  /** Shown by clients that display one. The app's own public address. */
  websiteUrl?: string;
}

/**
 * The answer to `initialize`.
 *
 * `capabilities.tools` is declared and nothing else is — this server has no
 * resources, prompts, logging or sampling, and announcing a capability it does
 * not implement makes a client call a method that then fails.
 *
 * `listChanged: false`: the tool list of a given installation is fixed at build
 * time (`lib/mcp/tools.ts`), so there is no notification to send. It becomes
 * true only if tools ever start appearing at runtime.
 */
export function initializeResult(args: {
  clientVersion: string | undefined;
  server: ServerInfo;
  instructions?: string;
}) {
  const version =
    args.clientVersion && isSupportedVersion(args.clientVersion)
      ? args.clientVersion
      : PROTOCOL_VERSION;

  return {
    protocolVersion: version,
    capabilities: { tools: { listChanged: false } },
    serverInfo: args.server,
    ...(args.instructions ? { instructions: args.instructions } : {}),
  };
}

// ── tools/call results ──────────────────────────────────────────────────────

/** One block of a tool result. Text only — this server returns no binaries. */
export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCallResult {
  content: TextContent[];
  /**
   * The tool ran and failed, as opposed to the CALL being wrong.
   *
   * This distinction is the one people get wrong, and it changes what the model
   * on the other end does. A JSON-RPC error means "that request was not
   * valid" — no such tool, malformed arguments — and the model should stop. An
   * `isError: true` RESULT means "the tool ran and could not do it", and the
   * model is meant to read the text, adapt and possibly try something else.
   *
   * "You do not have enough tokens" is the second kind. So is "no plan for
   * that". Sending either as a JSON-RPC error hides the reason from the model,
   * which then retries the identical call.
   */
  isError?: boolean;
}

export function toolText(text: string): ToolCallResult {
  return { content: [{ type: "text", text }] };
}

export function toolFailure(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * A result carrying structured data.
 *
 * The JSON is ALSO serialised into the text block, deliberately. `structuredContent`
 * is the newer field and not every client reads it yet; a client that ignores
 * it would otherwise see an empty result. The cost is a duplicated payload in
 * the response, which is cheaper than a tool that silently returns nothing.
 */
export function toolData(data: unknown): ToolCallResult & { structuredContent: unknown } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}
