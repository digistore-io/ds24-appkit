// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Every v1 handler guards itself — enforced structurally, not by review.
//
// `proxy.ts` matches `/dashboard` only, so everything under `app/api/` is
// PUBLIC until it protects itself. On the v1 surface that protection is
// `guardApi()` as the first thing a handler does, and THIS test is what makes
// the rule survive handler #7, added a year from now by somebody who never
// read the docs: a `route.ts` under `app/api/v1/` that does not import and
// call `guardApi` fails the build, with the file named.
//
// The one exception is named, not patterned: `auth/token` has no key to
// guard with — a key is what it exists to hand out. Its protection is the
// password check plus the mint meter, asserted in its own colocated test.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const V1 = __dirname;

/** The token endpoint — the sign-in door, guarded differently on purpose. */
const EXEMPT = ["auth/token/route.ts"];

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(full));
    else if (entry.name === "route.ts") found.push(full);
  }
  return found;
}

const routes = routeFiles(V1).map((full) => ({
  full,
  relative: path.relative(V1, full).split(path.sep).join("/"),
}));

describe("every /api/v1 handler calls guardApi", () => {
  it("actually finds the routes, so an empty sweep means something", () => {
    // Non-vacuity: a broken walk must not go green by checking nothing.
    expect(routes.length).toBeGreaterThanOrEqual(9);
    expect(routes.some((r) => r.relative === "me/route.ts")).toBe(true);
  });

  for (const route of routes) {
    if (EXEMPT.includes(route.relative)) continue;

    it(`${route.relative} imports guardApi and calls it`, () => {
      const source = readFileSync(route.full, "utf8");
      expect(
        source.includes('from "@/lib/api/guard"'),
        `${route.relative} does not import guardApi — every v1 handler guards itself (docs/api.md)`,
      ).toBe(true);
      expect(
        /await\s+guardApi\s*\(/.test(source),
        `${route.relative} imports guardApi but never calls it`,
      ).toBe(true);
    });
  }

  it("keeps the exemption list honest — only files that exist", () => {
    for (const exempt of EXEMPT) {
      expect(
        routes.some((r) => r.relative === exempt),
        `guard-presence exemption "${exempt}" names no existing route`,
      ).toBe(true);
    }
  });
});
