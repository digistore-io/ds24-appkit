// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// A guard over the file itself, in the shape of lib/ai/providers/leak-guard.test.ts
// and db/sql-cast.test.ts: what is checked here cannot be checked by calling the
// code, because both failures compile, typecheck and serve pages.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");

/**
 * The file without its comments. Necessary rather than tidy: the shape the
 * second test forbids is NAMED in a comment right above the code that avoids
 * it, so a check over the raw text would fail on its own documentation.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("proxy.ts", () => {
  it("still protects /dashboard", () => {
    // The matcher grew a second reason to list a path (cookie cleanup on /login
    // and /). Whoever tidies that list must not take this entry with it — every
    // page behind the sign-in hangs on it, and nothing else in the test suite
    // would go red.
    expect(source).toContain('"/dashboard/:path*"');
  });

  it("does not wrap auth() in a handler — that would drop the protection", () => {
    // `auth(async (req) => …)` is the documented shape and it is WRONG here:
    // handleAuth() runs the handler instead of the branch that redirects an
    // unauthorized request, so authorized() is called and its answer thrown
    // away. The whole reasoning is at the `guarded` cast in proxy.ts.
    expect(code).not.toMatch(/\bauth\s*\(\s*(async\s*)?\(/);
  });
});
