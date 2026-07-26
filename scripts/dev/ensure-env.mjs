// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Makes sure a usable .env exists:
//   1. if it is missing, it is created from .env.example,
//   2. an empty AUTH_SECRET is filled with a random value.
//
// Why point 2: without AUTH_SECRET, Auth.js throws "MissingSecret" on every
// sign-in attempt — but only into the log. The pages look normal, and the
// error only shows up once sign-in does not work. A locally generated secret
// costs nothing and spares you exactly that dead end.
//
// In production AUTH_SECRET is NOT set here, but in the secret management of
// your host (see docs/DEPLOY.md).
//
// Called by `node run.mjs env`, and as a prerequisite of nearly every other task.
import { copyFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readEnvValue, setEnvValue } from "../lib/env-write.mjs";

const ENV_FILE = ".env";

export function ensureEnv() {
  if (!existsSync(ENV_FILE)) {
    if (!existsSync(".env.example")) {
      throw new Error("neither .env nor .env.example is present.");
    }
    copyFileSync(".env.example", ENV_FILE);
    console.log("→ .env created from .env.example.");
  }

  // Only fill it in if the line is missing or empty — never overwrite a set value.
  if (readEnvValue(ENV_FILE, "AUTH_SECRET")) return;

  // node:crypto rather than `openssl rand`: openssl is not on every machine, and
  // macOS ships LibreSSL. See CLAUDE.md → Three systems.
  setEnvValue(ENV_FILE, "AUTH_SECRET", randomBytes(32).toString("hex"));
  console.log("→ AUTH_SECRET generated in .env (local development secret).");
}
