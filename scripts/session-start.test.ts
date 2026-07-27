// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The greeting has to greet a beginner as a beginner.
//
// `scripts/dev/session-start.mjs` decides between two texts by counting the
// pages under app/dashboard/ that the template did NOT ship. Zero means "fresh
// clone" and prints the one sentence the whole README points at — "Build my
// app". Anything above zero means "project under way".
//
// So the list of shipped pages in that hook is load-bearing, and it goes wrong
// in the quietest way there is: somebody adds a page to the template, the list
// stays as it was, the count never reaches zero again, and from then on every
// first-time user is asked what they want to carry on with — in an app in which
// they have not done anything yet. Nothing throws, no page breaks, and the only
// symptom is a greeting nobody who works here ever sees, because their own
// project is under way. That happened once already, with app/dashboard/chat.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

describe("the session greeting knows which pages ship with the template", () => {
  const hook = readFileSync(path.join(ROOT, "scripts/dev/session-start.mjs"), "utf8");

  // Read as text, not imported: the hook prints the greeting on import and asks
  // the doctor while doing it. Its own side effects are the point of the file.
  const declared = hook.match(/const SHIPPED = new Set\(\[([^\]]*)\]\)/);

  const onDisk = readdirSync(path.join(ROOT, "app/dashboard"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("declares the list in the form this test can read", () => {
    expect(declared, "const SHIPPED = new Set([…]) not found in the hook").not.toBeNull();
  });

  it("names exactly the folders app/dashboard/ actually ships", () => {
    const shipped = [...declared![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    // Both directions matter. A missing name makes a fresh clone look like a
    // project under way; a leftover name hides a page the customer built.
    expect(shipped.sort()).toEqual(onDisk.sort());
  });
});
