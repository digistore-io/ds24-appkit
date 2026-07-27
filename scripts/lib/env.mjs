// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Loads .env into process.env — for the CLI scripts in scripts/.
//
// Deliberately solved without a Node flag (`--env-file`): that one exists under
// different names depending on the Node version. This variant runs everywhere
// from Node 18 on.
//
// Rules: environment variables that are already set win (so that
// `DATABASE_URL=… npm run db:seed` keeps working), comments and empty lines
// are ignored, surrounding quotes are stripped.
//
// Split on `\r?\n` and not on `\n`: the .env is gitignored, so .gitattributes
// never sees it, and on Windows it may well carry CRLF. The `.trim()` below
// would take the stray `\r` with it — but by accident, and the next change to
// this function would not know that. See scripts/lib/env-write.mjs.
import { readFileSync, existsSync } from "node:fs";

export function loadEnv(file = ".env") {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Import for the side effect: `import "../lib/env.mjs"` is enough in the scripts.
loadEnv();
