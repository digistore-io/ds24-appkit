#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Checks that an environment really HOLDS the content this app declares —
// the check that sees the empty-but-200 course page no other gate can.
//
//   node run.mjs content-check              # this machine's environment
//   node run.mjs content-check --env prod   # the PROD store (MEDIA_S3_*_PROD)
//                                           # + the DATABASE_URL in your shell
//
// `smoke` proves pages answer; a course page over an empty table answers 200
// with nothing on it. `content-check` asks the other question — is the
// content THERE — in four passes, and it never writes anything:
//
//  1. **Manifest ↔ disk.** Every entry parses, obeys the grammar, and its
//     file is on one of the two legs (or its bytes are at least recorded);
//     a shipped file past the 10 MB ceiling is named with where it goes.
//  2. **Manifest ↔ store.** HEAD every key against the environment's store.
//     An unreachable store is a failure, never a skip — "green because it
//     checked" and "green because it could not look" must not share a colour.
//  3. **Manifest ↔ database.** A `media` row exists for every entry.
//  4. **Appliers ↔ database.** Every applier's `present(sql)` answers > 0.
//     Appliers that exist while their rows are absent is THE red line: it is
//     what a production database looks like when `content-apply` was never
//     run against it.
//
// Green against `--env prod` is go-live §5's exit condition. No manifest and
// no appliers is a clean pass — an app that ships no content has nothing to
// hold.
import { statSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import {
  CONTENT_MEDIA_MANIFEST,
  CONTENT_MEDIA_SHIPPED_DIR,
  CONTENT_MEDIA_SHIPPED_MAX_BYTES,
  CONTENT_MEDIA_STAGED_DIR,
} from "../../lib/content-media/rules.mjs";
import { loadManifest } from "./_manifest.mjs";
import {
  describeStore,
  isLocalDatabaseUrl,
  machineEnv,
  resolveTargetEnv,
  storeForEnv,
} from "../lib/media-env.mjs";
import { objectPresent } from "../lib/store-sync.mjs";
import "../lib/env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APPLIERS_DIR = join(ROOT, "scripts", "content", "appliers");

const argv = process.argv.slice(2);

let failed = false;
function ok(line) {
  console.log(`  ✓ ${line}`);
}
function warn(line) {
  console.log(`  ! ${line}`);
}
function bad(line) {
  console.log(`  ✗ ${line}`);
  failed = true;
}

function fileAt(dir, path) {
  const full = join(ROOT, ...dir.split("/"), ...path.split("/"));
  try {
    const stats = statSync(full);
    return stats.isFile() ? { full, bytes: stats.size } : null;
  } catch {
    return null;
  }
}

function applierFiles() {
  let entries;
  try {
    entries = readdirSync(APPLIERS_DIR);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith(".mjs") && !name.startsWith("_")).sort();
}

async function main() {
  const resolvedEnv = resolveTargetEnv(argv);
  if (resolvedEnv.error) {
    console.error(`✗ ${resolvedEnv.error}`);
    process.exit(1);
  }
  const env = resolvedEnv.env;
  const crossEnv = env !== machineEnv();

  const manifest = loadManifest(ROOT);
  const appliers = applierFiles();

  if (manifest.missing && appliers.length === 0) {
    console.log(
      `\n✓ Nothing to check — no ${CONTENT_MEDIA_MANIFEST} and no scripts/content/appliers/.` +
        "\n  An app that ships content declares it there (docs/content.md).\n",
    );
    return;
  }

  const entries = manifest.missing ? [] : manifest.entries;

  // ── 1. Manifest ↔ disk ─────────────────────────────────────────────────────
  console.log("\nManifest and files:");
  if (!manifest.missing) {
    for (const problem of manifest.problems) bad(problem);
  }
  for (const entry of entries) {
    const shipped = fileAt(CONTENT_MEDIA_SHIPPED_DIR, entry.path);
    const staged = fileAt(CONTENT_MEDIA_STAGED_DIR, entry.path);
    if (shipped && shipped.bytes > CONTENT_MEDIA_SHIPPED_MAX_BYTES) {
      bad(
        `${entry.path} — ${(shipped.bytes / 1024 / 1024).toFixed(1)} MB in the repo; past ` +
          `${CONTENT_MEDIA_SHIPPED_MAX_BYTES / 1024 / 1024} MB it belongs in ` +
          `${CONTENT_MEDIA_STAGED_DIR}/ (then: content-media-sync)`,
      );
    } else if (shipped) {
      ok(`${entry.path} — shipped (${CONTENT_MEDIA_SHIPPED_DIR}/)`);
    } else if (staged) {
      ok(`${entry.path} — staged (${CONTENT_MEDIA_STAGED_DIR}/)`);
    } else if (entry.sha256 && entry.bytes) {
      ok(`${entry.path} — not on this machine; sha256/bytes recorded, the store check decides`);
    } else {
      bad(
        `${entry.path} — no file on either leg and no sha256/bytes recorded; ` +
          "no environment can hold what nothing describes",
      );
    }
  }
  if (entries.length === 0 && !manifest.missing && manifest.problems.length === 0) {
    warn("the manifest is valid and empty — appliers below are checked either way");
  }

  // ── 2. Manifest ↔ store ────────────────────────────────────────────────────
  const store = storeForEnv(env);
  console.log("\nStore:");
  if (store.error) {
    bad(store.error);
  } else {
    console.log(`  (${describeStore(env, store)})`);
    for (const entry of entries) {
      const answer = await objectPresent(store, entry.key);
      if (answer.error) {
        bad(answer.error);
        // One unreachable store fails the pass; checking forty keys against
        // it would print the same sentence forty times.
        break;
      }
      if (answer.present) {
        ok(`${entry.key} — in the store`);
      } else {
        bad(
          `${entry.key} — NOT in the store. Shipped files travel with content-apply, ` +
            `staged ones with content-media-sync${crossEnv ? ` --env ${env}` : ""} --apply`,
        );
      }
    }
    if (entries.length === 0) ok("no media entries — nothing the store has to hold");
  }

  // ── 3 + 4. Database ────────────────────────────────────────────────────────
  console.log("\nDatabase:");
  const dbUrl = process.env.DATABASE_URL;
  if (crossEnv && isLocalDatabaseUrl(dbUrl)) {
    bad(
      `--env ${env} with a local DATABASE_URL — this would check YOUR database and call it ` +
        `${env.toUpperCase()}. Set the ${env.toUpperCase()} database's DATABASE_URL in the ` +
        "shell for this one command (the user-create procedure, docs/DEPLOY.md)",
    );
  } else if (!dbUrl) {
    bad("DATABASE_URL is not set (see .env) — the database half cannot be checked, so it is not green");
  } else {
    let sql = null;
    try {
      const { default: postgres } = await import("postgres");
      sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });

      if (entries.length > 0) {
        const keys = entries.map((entry) => entry.key);
        const found = await sql`select storage_key from media where storage_key = any(${keys})`;
        const present = new Set(found.map((row) => row.storage_key));
        for (const entry of entries) {
          if (present.has(entry.key)) {
            ok(`${entry.key} — media row exists`);
          } else {
            bad(`${entry.key} — NO media row. Run content-apply against this environment's database`);
          }
        }
      } else {
        ok("no media entries — no rows the database has to hold");
      }

      for (const name of appliers) {
        let module;
        try {
          module = await import(pathToFileURL(join(APPLIERS_DIR, name)).href);
        } catch (error) {
          bad(`applier ${name} — cannot be loaded: ${error.message}`);
          continue;
        }
        if (typeof module.present !== "function") {
          bad(
            `applier ${name} — exports no present(sql) function, so nobody can ask whether its ` +
              "rows exist (docs/content.md has the convention)",
          );
          continue;
        }
        try {
          const count = await module.present(sql);
          if (Number.isFinite(count) && count > 0) {
            ok(`applier ${name} — ${count} row(s) present`);
          } else {
            bad(
              `applier ${name} — 0 rows present. The applier exists, its content does not: ` +
                "this is what a database looks like when content-apply never ran against it",
            );
          }
        } catch (error) {
          bad(`applier ${name} — present(sql) failed: ${error.message}`);
        }
      }
    } catch (error) {
      bad(
        `the database does not answer: ${error.message} — locally: node run.mjs start; ` +
          "a checked environment that cannot be reached is not a green one",
      );
    } finally {
      if (sql) await sql.end();
    }
  }

  console.log(
    failed
      ? `\n✗ content-check: the ${env.toUpperCase()} environment does not hold this app's content.\n`
      : `\n✓ content-check: the ${env.toUpperCase()} environment holds this app's content.\n`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✗ content-check failed: ${error.message}\n`);
  process.exit(1);
});
