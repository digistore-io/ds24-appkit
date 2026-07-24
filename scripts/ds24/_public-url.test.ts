import { describe, it, expect } from "vitest";
import {
  DEFAULT_REDIR_URL,
  isLocalhostUrl,
  publicUrlFor,
  redirUrl,
} from "./_public-url.mjs";

describe("isLocalhostUrl", () => {
  it("recognizes the hosts that only exist on this machine", () => {
    expect(isLocalhostUrl("http://localhost:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://[::1]:3000/x")).toBe(true);
    expect(isLocalhostUrl("http://0.0.0.0:3000/x")).toBe(true);
  });

  it("leaves real addresses alone — including https on localhost", () => {
    expect(isLocalhostUrl("https://app.example.de/x")).toBe(false);
    // https://localhost has a certificate problem, not a reachability one —
    // rewriting it would be the wrong repair.
    expect(isLocalhostUrl("https://localhost:3000/x")).toBe(false);
    expect(isLocalhostUrl("http://example.com/x")).toBe(false);
  });

  it("says no to what it cannot read", () => {
    expect(isLocalhostUrl("")).toBe(false);
    expect(isLocalhostUrl(undefined)).toBe(false);
    expect(isLocalhostUrl("not a url")).toBe(false);
  });
});

describe("redirUrl", () => {
  it("defaults to the public relay of the template", () => {
    expect(redirUrl({})).toBe(DEFAULT_REDIR_URL);
  });

  it("can be pointed somewhere else, with or without a trailing slash", () => {
    expect(redirUrl({ DIGISTORE_REDIR_URL: "https://own.example/redir" })).toBe(
      "https://own.example/redir/",
    );
    expect(redirUrl({ DIGISTORE_REDIR_URL: "https://own.example/redir/" })).toBe(
      "https://own.example/redir/",
    );
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
    // A second parameter needs an "&", and that is the separator of the redirect
    // URL itself — the path would be cut off there. Better an honest error from
    // Digistore24 than a redirect that silently loses half the address.
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
