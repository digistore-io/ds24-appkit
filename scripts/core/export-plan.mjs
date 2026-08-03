// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What may an export touch, and what must it leave alone?
//
// `node run.mjs export-core` copies the shared core (config/core-export.json)
// into a companion repo — typically a mobile app that talks to this app's
// `/api/v1`. The classification is EXACTLY the one `node run.mjs update` makes
// for guidance text, applied to code files, and it is deliberately not
// re-implemented: `planUpdate()` from ../dev/update-plan.mjs decides, this
// file only supplies the two pieces that are export-shaped — where writing is
// refused, and what the stamp looks like.
//
//   current === shipped   the consumer never touched it → safe to replace
//   current !== shipped   somebody edited it there → hands off, say so
//
// `.core-version` in the target directory is the deliberate echo of
// `.template-version` in this app: the same semantics under the same kind of
// name, so whoever has understood one has understood the other.
//
// Pure on purpose: no fetch, no fs, no clock. The shell around it is export.mjs.

/**
 * Why a target directory is refused, or null when it is usable.
 *
 * Both arguments are ABSOLUTE, resolved paths — the shell resolves, this
 * decides. Refused: no target at all, the project itself, anything inside it.
 * An export into the app's own tree would shadow the originals and turn the
 * next `git status` into a riddle; the whole point is a SECOND repo.
 */
export function refuseTarget(targetAbs, projectRootAbs) {
  const target = String(targetAbs ?? "").trim();
  if (target === "") return "no target directory given";

  const root = String(projectRootAbs ?? "");
  if (target === root) return "the target is this app itself";

  // Path-segment-aware: `/x/app-mobile` is NOT inside `/x/app`.
  const rootWithSep = root.endsWith("/") || root.endsWith("\\") ? root : `${root}/`;
  if (target.startsWith(rootWithSep) || target.startsWith(`${root}\\`)) {
    return "the target is inside this app — export into a separate repo";
  }

  return null;
}

/**
 * The `.core-version` stamp for one export.
 *
 * No timestamp, deliberately: same input, same output — the same reasoning as
 * `knowledge-stamp.mjs`. `version` is this app's package.json version, so a
 * consumer (and a support question) can say which template state its core
 * came from.
 */
export function exportStamp({ version, files }) {
  return {
    source: "ds24-appkit shared core — written by `node run.mjs export-core`; see docs/mobile.md",
    version: String(version ?? "0.0.0"),
    files: { ...files },
  };
}
