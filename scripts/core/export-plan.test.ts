// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { exportStamp, refuseTarget } from "./export-plan.mjs";

describe("refuseTarget", () => {
  const ROOT = "/home/somebody/my-app";

  it("accepts a sibling directory — the intended shape", () => {
    expect(refuseTarget("/home/somebody/my-app-mobile/core", ROOT)).toBeNull();
  });

  it("refuses an empty target", () => {
    expect(refuseTarget("", ROOT)).toContain("no target");
    expect(refuseTarget(undefined, ROOT)).toContain("no target");
  });

  it("refuses the project itself and anything inside it", () => {
    expect(refuseTarget(ROOT, ROOT)).toContain("this app itself");
    expect(refuseTarget(`${ROOT}/core`, ROOT)).toContain("inside this app");
  });

  it("does not mistake a sibling with the same prefix for 'inside'", () => {
    // `/x/my-app-mobile` starts with `/x/my-app` as a STRING — the check has
    // to be path-segment-aware or the natural naming convention is refused.
    expect(refuseTarget("/home/somebody/my-app-mobile", ROOT)).toBeNull();
  });
});

describe("exportStamp", () => {
  it("carries version and per-file hashes, and no timestamp", () => {
    const stamp = exportStamp({ version: "0.11.0", files: { "lib/roles.ts": "abc" } });
    expect(stamp.version).toBe("0.11.0");
    expect(stamp.files).toEqual({ "lib/roles.ts": "abc" });
    // Same input, same output — a timestamp would make every export a diff.
    expect(JSON.stringify(stamp)).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("copies the files map instead of aliasing it", () => {
    const files: Record<string, string> = { "a.ts": "1" };
    const stamp = exportStamp({ version: "1.0.0", files });
    files["b.ts"] = "2";
    expect(stamp.files).toEqual({ "a.ts": "1" });
  });
});
