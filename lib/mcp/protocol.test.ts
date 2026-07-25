import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  SUPPORTED_VERSIONS,
  initializeResult,
  isSupportedVersion,
  parseMessage,
  rpcError,
  rpcResult,
  toolData,
  toolFailure,
  toolText,
} from "./protocol";

describe("parseMessage", () => {
  it("reads a request", () => {
    const parsed = parseMessage({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(parsed).toEqual({
      kind: "request",
      message: { jsonrpc: "2.0", id: 1, method: "ping", params: undefined },
    });
  });

  it("reads a notification as a notification", () => {
    // The distinction is load-bearing: a notification is answered with 202 and
    // no body, and answering it with a response leaves the client holding a
    // result it cannot match to anything.
    const parsed = parseMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(parsed.kind).toBe("notification");
  });

  it("treats an explicit null id as a REQUEST, not a notification", () => {
    // "the key is absent" ≠ "the id is null". Getting this backwards makes the
    // caller wait for a response that never comes.
    const parsed = parseMessage({ jsonrpc: "2.0", id: null, method: "ping" });
    expect(parsed.kind).toBe("request");
  });

  it("keeps the id on an invalid request so the client can match the error", () => {
    const parsed = parseMessage({ jsonrpc: "1.0", id: 7, method: "ping" });
    expect(parsed).toMatchObject({ kind: "invalid", id: 7 });
  });

  it("refuses a batch", () => {
    // Removed from the spec in 2025-06-18; no current client sends one.
    expect(parseMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }])).toMatchObject({
      kind: "invalid",
      id: null,
    });
  });

  it("refuses anything that is not an object", () => {
    for (const body of [null, "ping", 42, true]) {
      expect(parseMessage(body).kind).toBe("invalid");
    }
  });

  it("refuses a missing or non-string method", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: 1 }).kind).toBe("invalid");
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: "" }).kind).toBe("invalid");
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: 5 }).kind).toBe("invalid");
  });

  it("drops params that are not an object rather than passing them through", () => {
    const parsed = parseMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: [1, 2] });
    expect(parsed).toMatchObject({ kind: "request" });
    if (parsed.kind === "request") expect(parsed.message.params).toBeUndefined();
  });
});

describe("version negotiation", () => {
  it("speaks the version it advertises", () => {
    expect(isSupportedVersion(PROTOCOL_VERSION)).toBe(true);
    expect(SUPPORTED_VERSIONS).toContain(PROTOCOL_VERSION);
  });

  it("agrees to a supported version the client asked for", () => {
    const result = initializeResult({
      clientVersion: "2025-06-18",
      server: { name: "x", version: "1.0.0" },
    });
    expect(result.protocolVersion).toBe("2025-06-18");
  });

  it("answers with its own version when the client asks for one it does not speak", () => {
    // Not an error: the spec's negotiation lets the client decide whether it
    // can live with the answer.
    const result = initializeResult({
      clientVersion: "2099-01-01",
      server: { name: "x", version: "1.0.0" },
    });
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("declares tools and nothing it does not implement", () => {
    const result = initializeResult({
      clientVersion: undefined,
      server: { name: "x", version: "1.0.0" },
    });
    // Announcing a capability this server lacks makes clients call methods that
    // then fail.
    expect(Object.keys(result.capabilities)).toEqual(["tools"]);
    expect(result.capabilities.tools.listChanged).toBe(false);
  });

  it("omits instructions when there are none", () => {
    const without = initializeResult({
      clientVersion: undefined,
      server: { name: "x", version: "1.0.0" },
    });
    expect(without).not.toHaveProperty("instructions");

    const with_ = initializeResult({
      clientVersion: undefined,
      server: { name: "x", version: "1.0.0" },
      instructions: "Use account_overview first.",
    });
    expect(with_).toHaveProperty("instructions", "Use account_overview first.");
  });
});

describe("result envelopes", () => {
  it("builds a result and an error with the id they were asked about", () => {
    expect(rpcResult(3, { ok: true })).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: true } });
    expect(rpcError(3, -32601, "nope")).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32601, message: "nope" },
    });
  });

  it("omits the data field unless there is data", () => {
    expect(rpcError(1, -1, "m")).not.toHaveProperty("error.data");
    expect(rpcError(1, -1, "m", { why: "x" })).toHaveProperty("error.data", { why: "x" });
  });
});

describe("tool results", () => {
  it("marks a failure as a result, not a protocol error", () => {
    // The model is meant to read this and adapt; a JSON-RPC error hides the
    // reason and produces an identical retry.
    expect(toolFailure("out of tokens")).toEqual({
      content: [{ type: "text", text: "out of tokens" }],
      isError: true,
    });
    expect(toolText("fine")).not.toHaveProperty("isError");
  });

  it("puts structured data in BOTH fields", () => {
    // `structuredContent` is the newer field; a client that ignores it would
    // otherwise see an empty result.
    const result = toolData({ balance: 100 });
    expect(result.structuredContent).toEqual({ balance: 100 });
    expect(JSON.parse(result.content[0].text)).toEqual({ balance: 100 });
  });
});
