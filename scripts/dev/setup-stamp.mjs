// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// "This machine has been checked" — one small file in .dev/.
//
// It exists so the setup question is asked once and not before every task. The
// greeting reads it (`[Setup: ok — verified 2026-07-26]`), and the skill
// `build-app` skips its own `doctor` run when it is there — which is what makes
// a hard precondition affordable.
//
// What it is NOT: a replacement for looking. The cheap half of the checklist
// (`inspect({ quick: true })` — three file lookups and a TCP connect) still runs
// on every session start. This file only remembers that the EXPENSIVE half went
// through once: the Docker daemon, `npm install`, the migrations. Those are the
// ones nobody wants to pay for twice.
//
// Written by `node run.mjs setup` (once the whole preparation succeeded) and by
// `node run.mjs doctor` (when nothing is blocking). Never by the hook — a
// greeting that writes files is a greeting that can fail.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const STAMP = ".dev/setup-ok.json";

/** The Node major this file was written under — the one thing that invalidates it. */
const nodeMajor = (version) => Number(String(version).replace(/^v/, "").split(".")[0]);

/** This app's own version, for the record. Never a reason to reject a stamp. */
function templateVersion() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/**
 * The stamp, or null.
 *
 * Every failure — no file, no .dev/, half-written JSON — is a null. This is
 * read by the SessionStart hook, where "I do not know" has to be a normal
 * answer rather than a stack trace in front of somebody's first session.
 */
export function readStamp() {
  try {
    const stamp = JSON.parse(readFileSync(STAMP, "utf8"));
    return stamp && typeof stamp === "object" ? stamp : null;
  } catch {
    return null;
  }
}

/**
 * Does the stamp still describe THIS machine?
 *
 * Two things void it, and both are things that really happen: somebody installs
 * a different Node (the check that was passed was passed under another one), and
 * a project folder that travels between systems — a clone in WSL opened from
 * Windows, a repo on a shared drive. Everything else is deliberately not asked
 * here: whether the dependencies are still fresh and whether the database
 * answers is what the quick checks are for, every session.
 *
 * @param {Record<string, unknown> | null} stamp
 * @param {{ node?: string, platform?: string }} [machine] — this machine, so the
 *   test can hand it another one.
 */
export function stampValid(stamp, machine = {}) {
  const { node = process.version, platform = String(process.platform) } = machine;
  if (!stamp?.verifiedAt) return false;
  if (nodeMajor(stamp.node) !== nodeMajor(node)) return false;
  if (stamp.platform !== platform) return false;
  return true;
}

/** The day it was verified, as YYYY-MM-DD — "" when there is nothing to say. */
export function verifiedOn(stamp) {
  const at = stamp?.verifiedAt;
  return typeof at === "string" && at.length >= 10 ? at.slice(0, 10) : "";
}

/**
 * Note that this machine is ready.
 *
 * Swallows its own errors: a read-only .dev/, a full disk. Failing `setup` over
 * a note about `setup` would take away the thing that worked to protect the
 * record of it.
 */
export function writeStamp() {
  const stamp = {
    verifiedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    template: templateVersion(),
  };
  try {
    mkdirSync(".dev", { recursive: true });
    writeFileSync(STAMP, `${JSON.stringify(stamp, null, 2)}\n`);
  } catch {
    /* then the next session simply asks again */
  }
  return stamp;
}
