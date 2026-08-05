// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Fills the media store with the handbook's large files — repeatably.
//
//   node run.mjs kb-media-sync                    # dry run: what would be copied
//   node run.mjs kb-media-sync --apply            # copy what is missing
//   node run.mjs kb-media-sync --env prod --apply # into the PROD bucket
//                                                 # (MEDIA_S3_*_PROD keys)
//
// Knowledge Media past the shipped ceiling live in `.data/knowledge-media/`
// (gitignored, by convention) and are served from the app's media store under
// `knowledge/<path>` (AD-52). Nothing fills that store by itself — which is
// exactly the DEV hole AD-55 names: every bucket-leg card 404s under a green
// gate, because no command ever wrote to the store the route reads from. This
// command is that command, and it is the same one for DEV and PROD: `--env
// prod` fills the production store off the `MEDIA_S3_*_PROD` reference keys
// (scripts/lib/media-env.mjs). It used to be "edit the .env to the prod
// values and back" — retired, because an edit like that is exactly the kind
// that stays behind by accident and the plain keys must keep meaning THIS
// machine.
//
// Three properties are the whole design (shared, with the loop itself, in
// scripts/lib/store-sync.mjs):
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
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  KNOWLEDGE_MEDIA_BUCKET_PREFIX,
  KNOWLEDGE_MEDIA_TYPES,
  isValidMediaPath,
} from "../../lib/knowledge-media/rules.mjs";
import { describeStore, resolveTargetEnv, storeForEnv } from "../lib/media-env.mjs";
import { filesUnder, reportSync, syncItems } from "../lib/store-sync.mjs";
import "../lib/env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = join(ROOT, ".data", "knowledge-media");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");

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

async function main() {
  const resolvedEnv = resolveTargetEnv(argv);
  if (resolvedEnv.error) {
    console.error(`✗ ${resolvedEnv.error}`);
    process.exit(1);
  }
  const env = resolvedEnv.env;

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

  // The store first — which one this run fills is part of every line below,
  // and a misconfigured store is a refusal before anything is judged.
  const store = storeForEnv(env);
  if (store.error) {
    console.log("");
    bad(store.error);
    console.log("");
    process.exit(1);
  }
  console.log(`\n${describeStore(env, store)}\n`);

  // Grammar next, for the whole tree: a refused name is reported and never
  // copied, so the store cannot end up holding a key the route would 404 on.
  const items = [];
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
    const extension = path.slice(path.lastIndexOf(".") + 1);
    items.push({
      path,
      source: join(SOURCE, ...path.split("/")),
      key: KNOWLEDGE_MEDIA_BUCKET_PREFIX + path,
      contentType: KNOWLEDGE_MEDIA_TYPES[extension].contentType,
    });
  }

  const result = await syncItems({ store, items, apply, log: { ok, warn, bad } });
  if (result.failed) failed = true;

  reportSync({ result, apply, commandName: "node run.mjs kb-media-sync" });
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✗ kb-media-sync failed: ${error.message}\n`);
  process.exit(1);
});
