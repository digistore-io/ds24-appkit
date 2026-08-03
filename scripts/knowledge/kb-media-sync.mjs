// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Fills the media store with the handbook's large files — repeatably.
//
//   node run.mjs kb-media-sync            # dry run: what would be copied
//   node run.mjs kb-media-sync --apply    # copy what is missing
//
// Knowledge Media past the shipped ceiling live in `.data/knowledge-media/`
// (gitignored, by convention) and are served from the app's media store under
// `knowledge/<path>` (AD-52). Nothing fills that store by itself — which is
// exactly the DEV hole AD-55 names: every bucket-leg card 404s under a green
// gate, because no command ever wrote to the store the route reads from. This
// command is that command, and it is the same one for DEV and PROD: point the
// `.env` at the environment's store and run it again.
//
// Three properties are the whole design:
//
//  1. **Dry run by default.** Without `--apply` it lists what would be copied
//     and writes nothing (the `scripts/users/create-user.mjs` convention).
//  2. **Only what is missing.** An object already in the store is skipped, so
//     the command is repeatable — running it twice is the same as once.
//  3. **A bad name never becomes a bad object key.** Paths that violate the
//     grammar in `lib/knowledge-media/rules.mjs` are refused, not copied —
//     one grammar (AD-56), and the store only ever holds keys the route and
//     the parser would accept.
//
// It speaks to the store the way `scripts/media/check.mjs` does — s3 through
// `lib/media/s3-request.mjs` (the same signer the app uses), the local driver
// through plain fs against the store root — because a `.mjs` script cannot
// import the TypeScript port `lib/media/store.ts`.
//
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { readdirSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
  KNOWLEDGE_MEDIA_BUCKET_PREFIX,
  KNOWLEDGE_MEDIA_TYPES,
  isValidMediaPath,
} from "../../lib/knowledge-media/rules.mjs";
import { s3SettingsFromEnv, sendS3 } from "../../lib/media/s3-request.mjs";
import "../lib/env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = join(ROOT, ".data", "knowledge-media");

const apply = process.argv.slice(2).includes("--apply");

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

/**
 * Every file below `.data/knowledge-media/`, as forward-slash paths relative
 * to it. Dotfiles are skipped silently — a `.DS_Store` is the operating
 * system's litter, not an operator's mistake worth a red gate.
 *
 * **Symlinks are followed, and a broken one is named.** A `Dirent` describes
 * the ENTRY, not what it points at, so for a symlink `isFile()` and
 * `isDirectory()` are BOTH false — the entry would fall through both branches
 * and vanish without a word. That matters here more than almost anywhere: a
 * staging folder for large files is exactly the place somebody symlinks a
 * 900 MB recording instead of copying it, and the whole point of this command
 * is that nothing goes missing between the folder and the store. So a symlink
 * is resolved with `statSync` (which follows): to a file it syncs like a file,
 * to a directory it is walked like a directory. When it resolves to nothing,
 * the path goes into `skipped` and is reported — never silently dropped, which
 * is the only failure mode here that leaves no trace anywhere.
 */
function filesUnder(dir, prefix = "", skipped = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null; // the folder does not exist — a normal state, handled below
  }
  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);

    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = statSync(full);
        isDirectory = target.isDirectory();
        isFile = target.isFile();
      } catch (error) {
        skipped.push(
          `${rel} — a symlink that resolves to nothing (${error.code ?? error.message}); ` +
            "skipped, so nothing under this name reaches the store",
        );
        continue;
      }
    }

    if (isDirectory) {
      found.push(...(filesUnder(full, rel, skipped) ?? []));
    } else if (isFile) {
      found.push(rel);
    }
  }
  return found;
}

async function main() {
  // Reported BEFORE the "nothing to sync" branch below: a folder holding only
  // broken symlinks would otherwise be announced as empty, which is the exact
  // wrong sentence for it.
  const skipped = [];
  const files = filesUnder(SOURCE, "", skipped);
  if (skipped.length > 0) {
    console.log("");
    for (const line of skipped) warn(line);
  }
  if (files === null || files.length === 0) {
    console.log(
      "\nNothing to sync — .data/knowledge-media/ is empty or does not exist." +
        "\nLarge Knowledge Media go in there, mirroring their reference path" +
        "\n(.data/knowledge-media/<topic-slug>/<file>.<ext>), then run this again.\n",
    );
    return;
  }
  files.sort();

  const driver = (process.env.MEDIA_DRIVER ?? "").trim().toLowerCase() || "local";

  // The store first — which one this run fills is part of every line below,
  // and a misconfigured s3 store is a refusal before anything is judged.
  let localRoot = null;
  let settings = null;
  if (driver === "local") {
    localRoot = resolve(ROOT, process.env.MEDIA_LOCAL_DIR?.trim() || ".data/media");
    console.log(`\nStore: driver "local" (${localRoot})\n`);
  } else if (driver === "s3") {
    settings = s3SettingsFromEnv();
    if (!settings) {
      console.log("");
      bad(
        "MEDIA_DRIVER=s3, but the bucket is not configured. Needs " +
          "MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and " +
          "MEDIA_S3_SECRET_ACCESS_KEY — see .env.example",
      );
      console.log("");
      process.exit(1);
    }
    // The endpoint-path trap, verbatim from media-check: a path segment on the
    // endpoint makes every signed request answer 403, and here a 403 would
    // read like "missing" and turn into a pointless upload attempt.
    try {
      const url = new URL(settings.endpoint);
      if (url.pathname !== "/" && url.pathname !== "") {
        console.log("");
        bad(
          `MEDIA_S3_ENDPOINT is "${settings.endpoint}" — it must be an ORIGIN with ` +
            "no path. The bucket name goes in MEDIA_S3_BUCKET",
        );
        console.log("");
        process.exit(1);
      }
    } catch {
      console.log("");
      bad(`MEDIA_S3_ENDPOINT is not a URL: "${settings.endpoint}"`);
      console.log("");
      process.exit(1);
    }
    console.log(`\nStore: driver "s3" (bucket "${settings.bucket}" at ${settings.endpoint})\n`);
  } else {
    console.log("");
    bad(`MEDIA_DRIVER="${driver}" is not a driver. Use "s3", or "local" in development.`);
    console.log("");
    process.exit(1);
  }

  // Grammar next, for the whole tree: a refused name is reported and never
  // copied, so the store cannot end up holding a key the route would 404 on.
  const plan = [];
  for (const path of files) {
    if (!isValidMediaPath(path)) {
      bad(
        `"${path}" violates the naming standard — <topic-slug>/<file>.<extension>, ` +
          "lowercase a-z, 0-9 and hyphens, exactly one folder, extension one of: " +
          `${Object.keys(KNOWLEDGE_MEDIA_TYPES).join(", ")}. Rename it; ` +
          "a bad name must not become a bad object key",
      );
      continue;
    }
    plan.push(path);
  }

  let copied = 0;
  let present = 0;
  let mp4Moved = false;
  // Set when the run stops early: the paths that were never even looked at.
  // Without it the summary below says "Done — 3 copied" over a run that gave
  // up after three of forty — a true number in a sentence that is a lie.
  let unprocessed = null;

  if (driver === "local") {
    for (const path of plan) {
      const key = KNOWLEDGE_MEDIA_BUCKET_PREFIX + path;
      const target = join(localRoot, ...key.split("/"));
      let already = false;
      try {
        already = (await stat(target)).isFile();
      } catch {
        already = false;
      }
      if (already) {
        present += 1;
        ok(`${path} — already in the store`);
        continue;
      }
      if (!apply) {
        warn(`${path} — would copy to ${key}`);
      } else {
        try {
          await mkdir(dirname(target), { recursive: true });
          await copyFile(join(SOURCE, ...path.split("/")), target);
          ok(`${path} — copied to ${key}`);
        } catch (error) {
          bad(`${path} — copying failed: ${error.message}`);
          continue;
        }
      }
      copied += 1;
      if (path.endsWith(".mp4")) mp4Moved = true;
    }
  } else {
    for (const path of plan) {
      const key = KNOWLEDGE_MEDIA_BUCKET_PREFIX + path;
      let head;
      try {
        head = await sendS3(settings, "HEAD", key);
      } catch (error) {
        bad(`the bucket is not reachable: ${error.message}`);
        // One network failure fails the run; retrying every key only slows it
        // down. What it must NOT do is leave the tail unmentioned — from here
        // on nothing is looked at, and the summary says so by name.
        unprocessed = plan.slice(plan.indexOf(path));
        break;
      }
      if (head.ok) {
        present += 1;
        ok(`${path} — already in the bucket`);
        continue;
      }
      if (head.status !== 404) {
        bad(`HEAD ${key} answered HTTP ${head.status} — not treating that as "missing"`);
        continue;
      }
      const extension = path.slice(path.lastIndexOf(".") + 1);
      const contentType = KNOWLEDGE_MEDIA_TYPES[extension].contentType;
      if (!apply) {
        warn(`${path} — would upload to ${key} (${contentType})`);
      } else {
        try {
          const body = await readFile(join(SOURCE, ...path.split("/")));
          const put = await sendS3(settings, "PUT", key, body, contentType);
          if (!put.ok) {
            const detail = (await put.text()).slice(0, 300);
            bad(`${path} — upload failed (HTTP ${put.status}) ${detail}`);
            continue;
          }
          ok(`${path} — uploaded to ${key} (${contentType})`);
        } catch (error) {
          bad(`${path} — upload failed: ${error.message}`);
          continue;
        }
      }
      copied += 1;
      if (path.endsWith(".mp4")) mp4Moved = true;
    }
  }

  console.log("");
  if (mp4Moved) {
    // Said at the moment an .mp4 moves, because afterwards nothing will: a
    // video without faststart downloads whole before the first frame plays.
    warn(
      "an .mp4 went (or would go) into the store — make sure it was encoded " +
        "with faststart (ffmpeg -movflags +faststart), or the player waits " +
        "for the whole download before it starts.",
    );
    console.log("");
  }

  if (unprocessed !== null) {
    // Not "Done" — the run stopped. Three numbers, because the one that
    // matters is the third: what nobody has looked at yet. Short lists are
    // named outright, long ones would bury the sentence that carries them.
    const names =
      unprocessed.length <= 10 ? `: ${unprocessed.join(", ")}` : " (run this again to see them)";
    console.log(
      `ABORTED — the store stopped answering. ${copied} object(s) ` +
        `${apply ? "copied" : "would have been copied"}, ${present} already there, ` +
        `${unprocessed.length} never processed${names}.`,
    );
    console.log(
      "Nothing about the remainder is known — fix the store and run this again; " +
        "the command is repeatable and skips what is already there.",
    );
  } else if (!apply) {
    console.log(
      copied === 0
        ? `Nothing missing — ${present} object(s) already in the store.`
        : `DRY RUN — ${copied} object(s) would be copied, ${present} already there. ` +
            "Nothing was written. To copy: node run.mjs kb-media-sync --apply",
    );
  } else {
    console.log(`Done — ${copied} object(s) copied, ${present} already there.`);
  }
  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✗ kb-media-sync failed: ${error.message}\n`);
  process.exit(1);
});
