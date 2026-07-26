// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Are the installed dependencies still current?
//
// The rule comes from the Makefile this project used to have, where
// node_modules was a file target: it is stale as soon as package-lock.json is
// newer. Spelled out here because two places need the same answer — the
// `node_modules` task in run.mjs, which installs, and `doctor`, which only
// reports.
import { existsSync, statSync, utimesSync } from "node:fs";

/** True when node_modules exists and is at least as new as the lockfile. */
export function depsFresh() {
  return (
    existsSync("node_modules") &&
    existsSync("package-lock.json") &&
    statSync("node_modules").mtimeMs >= statSync("package-lock.json").mtimeMs
  );
}

/**
 * Note that the dependencies have just been installed.
 * npm does not touch the folder's own mtime on every run, so without this an
 * install would be repeated on every command.
 */
export function markDepsFresh() {
  const now = new Date();
  utimesSync("node_modules", now, now);
}
