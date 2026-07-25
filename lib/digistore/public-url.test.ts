import { describe, it, expect } from "vitest";
import { isLocalhostUrl, publicUrlFor } from "./public-url";
import { DIGISTORE_REDIR_URL as DEFAULT_REDIR_URL } from "./config.mjs";

// The twin of scripts/ds24/_public-url.test.ts. Same rules, same cases — the
// setup scripts and the running app must not disagree about what Digistore24
// gets to see.

describe("isLocalhostUrl", () => {
  it("recognizes the hosts that only exist on this machine", () => {
    expect(isLocalhostUrl("http://localhost:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://[::1]:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://0.0.0.0:3000/x")).toBe(true);
  });

  it("leaves real addresses alone — including https on localhost", () => {
    expect(isLocalhostUrl("https://app.example.de/x")).toBe(false);
    expect(isLocalhostUrl("https://localhost:3000/x")).toBe(false);
    expect(isLocalhostUrl("http://example.com/x")).toBe(false);
  });

  it("says no to what it cannot read", () => {
    expect(isLocalhostUrl("")).toBe(false);
    expect(isLocalhostUrl(undefined)).toBe(false);
    expect(isLocalhostUrl("not a url")).toBe(false);
  });
});

describe("the redirect address", () => {
  it("is a public https address with a trailing slash", () => {
    // It is hard-wired (lib/digistore/config.mjs) rather than configurable:
    // Digistore24 takes public https only, and the page it points at is part
    // of the template. A trailing slash, because "?port=" is appended to it.
    expect(DEFAULT_REDIR_URL).toMatch(/^https:\/\/.+\/$/);
  });
});

describe("publicUrlFor", () => {
  it("routes a localhost URL through the public redirect", () => {
    expect(publicUrlFor("http://localhost:3000/optin/[ORDER_ID]")).toBe(
      `${DEFAULT_REDIR_URL}?port=3000&path=/optin/[ORDER_ID]`,
    );
  });

  it("keeps the Digistore24 placeholder literal — DS24 substitutes it", () => {
    const url = publicUrlFor("http://localhost:3000/optin/[ORDER_ID]");
    expect(url).toContain("[ORDER_ID]");
    expect(url).not.toContain("%5B");
  });

  it("fills in the port the scheme implies and a root path", () => {
    expect(publicUrlFor("http://localhost/x")).toBe(
      `${DEFAULT_REDIR_URL}?port=80&path=/x`,
    );
    expect(publicUrlFor("http://localhost:3000")).toBe(
      `${DEFAULT_REDIR_URL}?port=3000&path=/`,
    );
  });

  it("keeps a query on the local URL — as long as it stays representable", () => {
    expect(publicUrlFor("http://localhost:3000/callback?token=abc")).toBe(
      `${DEFAULT_REDIR_URL}?port=3000&path=/callback?token=abc`,
    );
  });

  it("does NOT touch a URL whose query would break the redirect", () => {
    const url = "http://localhost:3000/callback?a=1&b=2";
    expect(publicUrlFor(url)).toBe(url);
  });

  it("passes public URLs through untouched", () => {
    const url = "https://app.example.de/optin/[ORDER_ID]";
    expect(publicUrlFor(url)).toBe(url);
  });

  it("hands back what it cannot rewrite, instead of inventing something", () => {
    expect(publicUrlFor(undefined)).toBeUndefined();
    expect(publicUrlFor("")).toBeUndefined();
    expect(publicUrlFor("not a url")).toBe("not a url");
  });

  it("uses the relay it is given", () => {
    expect(
      publicUrlFor("http://localhost:3000/x", "https://own.example/redir/"),
    ).toBe("https://own.example/redir/?port=3000&path=/x");
  });
});
