// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import {
  classifyIpnRequest,
  ipnLogCutoff,
  IPN_LOG_RETENTION_DAYS,
} from "./ipn-log";

// classifyIpnRequest is the pure verdict at the IPN edge. It must fail closed:
// no passphrase and a bad signature both lose BEFORE the event is consulted, so
// a forged "connection_test" can never slip through as a real test.
describe("classifyIpnRequest", () => {
  it("rejects when no passphrase is configured — even with a valid-looking signature", () => {
    expect(
      classifyIpnRequest({
        hasPassphrase: false,
        signatureValid: true,
        event: "on_payment",
      }),
    ).toBe("not_configured");
  });

  it("rejects an invalid signature", () => {
    expect(
      classifyIpnRequest({
        hasPassphrase: true,
        signatureValid: false,
        event: "on_payment",
      }),
    ).toBe("invalid_signature");
  });

  it("does not let a forged connection_test bypass the signature check", () => {
    // hasPassphrase but signature invalid: the claimed event is irrelevant.
    expect(
      classifyIpnRequest({
        hasPassphrase: true,
        signatureValid: false,
        event: "connection_test",
      }),
    ).toBe("invalid_signature");
  });

  it("answers a genuine (signed) connection_test as such", () => {
    expect(
      classifyIpnRequest({
        hasPassphrase: true,
        signatureValid: true,
        event: "connection_test",
      }),
    ).toBe("connection_test");
  });

  it("hands a signed payment event off to processing", () => {
    expect(
      classifyIpnRequest({
        hasPassphrase: true,
        signatureValid: true,
        event: "on_payment",
      }),
    ).toBe("process");
  });

  it("treats an empty event on a signed request as something to process", () => {
    // An unknown/empty event is not a connection test; onPaymentEvent decides
    // what (if anything) it maps to — the edge just does not short-circuit it.
    expect(
      classifyIpnRequest({
        hasPassphrase: true,
        signatureValid: true,
        event: "",
      }),
    ).toBe("process");
  });
});

// The retention cutoff drives what the prune job deletes — off-by-a-day here
// would delete rows a day too early or keep them a day too long.
describe("ipnLogCutoff", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("defaults to 60 days before now", () => {
    expect(IPN_LOG_RETENTION_DAYS).toBe(60);
    // 60 days earlier, same wall-clock time.
    expect(ipnLogCutoff(now).toISOString()).toBe("2026-05-24T12:00:00.000Z");
  });

  it("honours a custom retention window", () => {
    expect(ipnLogCutoff(now, 1).toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });

  it("with 0 days the cutoff is now (everything in the past is stale)", () => {
    expect(ipnLogCutoff(now, 0).getTime()).toBe(now.getTime());
  });
});
