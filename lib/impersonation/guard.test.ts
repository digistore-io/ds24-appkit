// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The invariants of signing in as a user, asserted on the SOURCE TEXT.
//
// Three of them, and each one guards a change that would look entirely
// reasonable in a diff, typecheck cleanly, pass every other test in this repo
// and quietly turn a bounded support feature into an account-takeover bug.
//
// This is the same shape as `scripts/portability.test.ts` and
// `lib/ai/providers/leak-guard.test.ts`: there is no DOM and no build here, so
// reading the file IS the check — and unlike a sentence in a guide, a test
// fails the build on the whole CLASS of mistake rather than on one instance of
// it. `template/CLAUDE.md` says an invariant in this template is expressed this
// way; these are the invariants.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** The file with comments stripped — several of them discuss these very rules. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the exit is not owner-guarded", () => {
  // ── What this catches ──────────────────────────────────────────────────
  // Somebody reads `app/impersonation-actions.ts`, notices it is the only
  // server action in the app that does not open with `requireOwner()`, reads
  // that as an oversight, and adds it.
  //
  // The result: while an impersonation runs the session's role IS the member's
  // (AD-23), so the owner check refuses — and the Operator is locked inside a
  // customer's account with no way out but clearing their cookies. Every test
  // in this repo would still pass, because none of them signs in.
  it("stopImpersonationAction never calls requireOwner", () => {
    const source = code(read("app/impersonation-actions.ts"));
    expect(source).not.toMatch(/requireOwner/);
  });

  it("the exit takes no target — it can only ever end the caller's own session", () => {
    const source = code(read("app/impersonation-actions.ts"));
    // No FormData, so there is no request field that could name somebody else.
    // The same guarantee `spendTokens()` gives by having no `memberId`
    // parameter: not "does not currently read one", but "has nowhere to put
    // one".
    expect(source).not.toMatch(/FormData/);
    expect(source).not.toMatch(/formData/);
  });
});

describe("the token rewrite is authorised by the record row", () => {
  // ── What this catches ──────────────────────────────────────────────────
  // The single most dangerous change possible in this feature. `/api/auth/
  // session` accepts a POST from any signed-in user and hands the body to the
  // `jwt` callback. A callback that believes it — `token.sub = payload.memberId`
  // — lets ANY member become anyone, including an owner.
  //
  // What makes it safe is one comparison: the record row named in the payload
  // has to say that the caller is the Operator who opened it. Delete that line
  // and nothing else in the repo notices.
  it("session.ts compares the row's operator against the caller", () => {
    const source = code(read("lib/impersonation/session.ts"));
    expect(source).toMatch(/row\.operatorId\s*!==\s*caller/);
  });

  it("the update payload is never used as an identity", () => {
    const source = code(read("lib/impersonation/session.ts"));
    // The only thing taken from the request is `start`, a lookup key. Any of
    // these appearing on the payload would mean somebody started believing the
    // caller about who they are or who they may become.
    for (const forbidden of [
      /request\.memberId/,
      /request\.operatorId/,
      /request\.role/,
      /update\.memberId/,
      /payload\.memberId/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});

describe("the record is written before the session changes", () => {
  // ── What this catches ──────────────────────────────────────────────────
  // Reordering these two calls for tidiness. It reads like moving a log line;
  // it removes the authorisation, because the row IS what the callback above
  // checks. After the swap there would be a window in which a session has been
  // handed over with nothing to authorise it.
  it("openImpersonation is called before unstable_update", () => {
    const source = code(read("app/dashboard/admin/users/actions.ts"));
    const opened = source.indexOf("openImpersonation(");
    const updated = source.indexOf("unstable_update(");
    expect(opened).toBeGreaterThan(-1);
    expect(updated).toBeGreaterThan(-1);
    expect(opened).toBeLessThan(updated);
  });

  it("the start action still begins with requireOwner and asks the rule", () => {
    // The mirror image of the first block: this action is NOT the exception.
    const source = code(read("app/dashboard/admin/users/actions.ts"));
    const start = source.indexOf("startImpersonationAction");
    const body = source.slice(start);
    expect(body).toMatch(/requireOwner\(\)/);
    expect(body).toMatch(/canImpersonate\(/);
  });
});

describe("auth.config.ts stays free of the database", () => {
  // The impersonation state is read in the session callback, which sits in
  // front of every matched request. Reading it from the token is what keeps the
  // public home page query-free; a lookup here would put a round-trip on every
  // anonymous request the app serves.
  it("imports no database and no user lookup", () => {
    const source = code(read("auth.config.ts"));
    expect(source).not.toMatch(/from "@\/db/);
    expect(source).not.toMatch(/lib\/impersonation\/manage/);
    expect(source).not.toMatch(/lib\/impersonation\/session/);
  });
});
