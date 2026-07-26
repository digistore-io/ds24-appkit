// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The greeting's update line is read by everybody who opens this project, so the
// two ways it can be wrong both cost something real: too often and it becomes
// noise that gets ignored on the day it matters; never and the whole mechanism
// only reaches people who already knew about it.
import { describe as suite, expect, it } from "vitest";
import { describe, isDue } from "./update-check.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

suite("isDue", () => {
  it("asks on the first run", () => {
    expect(isDue(null, 1_000_000)).toBe(true);
  });

  it("asks again when a malformed cache is found", () => {
    expect(isDue({}, 1_000_000)).toBe(true);
    expect(isDue({ checkedAt: "yesterday" }, 1_000_000)).toBe(true);
  });

  it("stays quiet inside the day", () => {
    const now = 10 * DAY;
    expect(isDue({ checkedAt: now - HOUR }, now)).toBe(false);
  });

  it("asks once the day is up", () => {
    const now = 10 * DAY;
    expect(isDue({ checkedAt: now - DAY }, now)).toBe(true);
  });

  it("asks again when the stamp lies in the future", () => {
    // A restored machine or a clock correction would otherwise park the check
    // beyond any reachable date and switch it off silently.
    const now = 10 * DAY;
    expect(isDue({ checkedAt: now + 5 * DAY }, now)).toBe(true);
  });
});

suite("describe", () => {
  it("says nothing when there is nothing to fetch", () => {
    expect(describe({ available: 0, version: "0.2.0" })).toBeNull();
    expect(describe()).toBeNull();
  });

  it("takes the null that updateAvailable() answers with", () => {
    // Not hypothetical: `= {}` as a default covers `undefined` and not `null`,
    // and this threw inside the SessionStart hook the first time it ran.
    expect(describe(null)).toBeNull();
  });

  it("names the version and the number of files", () => {
    const line = describe({ available: 3, version: "0.2.0" });
    expect(line).toContain("0.2.0");
    expect(line).toContain("3 guidance file(s)");
    expect(line).toContain("node run.mjs update");
  });
});
