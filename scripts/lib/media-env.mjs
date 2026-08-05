// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The environment axis of the media store: dev / staging / prod.
//
// Every environment has its OWN media store, exactly as it has its own
// database and its own Digistore24 product set (docs/environments.md). This
// module is the one place the scripts decide WHICH environment's store a run
// talks to — the media twin of `scripts/ds24/_env.mjs`, and it deliberately
// imports that module's generic halves (`resolveSyncEnv`, `envScopedKey`)
// rather than growing a second copy of the `--env` grammar.
//
// The suffix rule is the one the Digistore keys established: the PLAIN
// `MEDIA_S3_*` keys always mean "the environment this machine runs as" — that
// is what the app reads at runtime and what a run on the deployed host uses,
// unchanged. A run for ANOTHER environment reads suffixed reference copies
// (`MEDIA_S3_ENDPOINT_PROD`, `MEDIA_S3_BUCKET_PROD`, …) — so filling the
// production bucket from your machine is a flag (`--env prod`), never an edit
// of the plain values. Editing `.env` to point at prod was the old procedure,
// and it is exactly the kind of edit that stays behind by accident; the
// APP_URL story in `_env.mjs` is what one forgotten edit of this kind costs.
//
// One refusal is deliberate and load-bearing: **a cross-environment run can
// never fall back to the local driver.** "The prod store" IS a bucket —
// `lib/env-guard.ts` refuses to start a PROD app on `MEDIA_DRIVER=local` — so
// a `--env prod` with no `MEDIA_S3_*_PROD` keys is a half-configured run and
// is named key by key, never quietly pointed at `.data/media/`.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { envScopedKey, resolveSyncEnv, syncEnvFromAppEnv } from "../ds24/_env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The environment this MACHINE runs as, from APP_ENV. */
export function machineEnv(e = process.env) {
  return syncEnvFromAppEnv(e.APP_ENV);
}

/**
 * The environment of THIS run: `--env dev|staging|prod` out of a raw argv
 * array, else the machine's own. `{ error }` on a typed value outside the
 * three — same contract as `resolveSyncEnv`, fed from the flag style every
 * script here uses (`--env prod`, two tokens).
 */
export function resolveTargetEnv(argv, e = process.env) {
  const index = argv.indexOf("--env");
  const flag = index === -1 ? undefined : (argv[index + 1] ?? true);
  return resolveSyncEnv({ env: flag }, e);
}

const S3_BASE_KEYS = [
  "MEDIA_S3_ENDPOINT",
  "MEDIA_S3_BUCKET",
  "MEDIA_S3_ACCESS_KEY_ID",
  "MEDIA_S3_SECRET_ACCESS_KEY",
];

/**
 * The endpoint-path trap, verbatim from media-check: a path segment on the
 * endpoint makes every signed request answer 403, and a 403 reads like
 * "missing" and turns into a pointless upload attempt. Checked here once, so
 * every command that resolves a store inherits the refusal.
 */
function endpointProblem(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.pathname !== "/" && url.pathname !== "") {
      return (
        `MEDIA_S3_ENDPOINT is "${endpoint}" — it must be an ORIGIN with ` +
        "no path. The bucket name goes in MEDIA_S3_BUCKET"
      );
    }
  } catch {
    return `MEDIA_S3_ENDPOINT is not a URL: "${endpoint}"`;
  }
  return null;
}

/**
 * The store a run for `env` talks to.
 *
 *   this machine's env   whatever MEDIA_DRIVER says — `.data/media/` in a
 *                        fresh DEV project, the configured bucket otherwise.
 *   any other env        the suffixed `MEDIA_S3_*_<ENV>` reference keys,
 *                        s3 always. Missing keys are an { error } naming
 *                        every one to set — never a local fallback.
 *
 * @returns {{driver: "local", localRoot: string}
 *   | {driver: "s3", settings: object}
 *   | {error: string}}
 */
export function storeForEnv(env, e = process.env, root = ROOT) {
  const machine = machineEnv(e);
  const key = (base) => envScopedKey(base, env, machine);

  if (env === machine) {
    const driver = (e.MEDIA_DRIVER ?? "").trim().toLowerCase() || "local";
    if (driver === "local") {
      return { driver: "local", localRoot: resolve(root, e.MEDIA_LOCAL_DIR?.trim() || ".data/media") };
    }
    if (driver !== "s3") {
      return { error: `MEDIA_DRIVER="${driver}" is not a driver. Use "s3", or "local" in development.` };
    }
  }

  const missing = S3_BASE_KEYS.map(key).filter((k) => !e[k]?.trim());
  if (missing.length > 0) {
    return {
      error:
        env === machine
          ? "MEDIA_DRIVER=s3, but the bucket is not configured. " +
            `Set ${missing.join(", ")} in the .env — see .env.example`
          : `No ${env} store known — a run for ${env.toUpperCase()} reads reference keys, ` +
            `never the plain ones (those stay what THIS machine uses). ` +
            `Set ${missing.join(", ")} in the .env — see .env.example`,
    };
  }

  const endpoint = e[key("MEDIA_S3_ENDPOINT")].trim().replace(/\/+$/, "");
  const problem = endpointProblem(endpoint);
  if (problem) return { error: problem };

  return {
    driver: "s3",
    settings: {
      endpoint,
      region: e[key("MEDIA_S3_REGION")]?.trim() || "auto",
      bucket: e[key("MEDIA_S3_BUCKET")].trim(),
      accessKeyId: e[key("MEDIA_S3_ACCESS_KEY_ID")].trim(),
      secretAccessKey: e[key("MEDIA_S3_SECRET_ACCESS_KEY")].trim(),
      publicBaseUrl: e[key("MEDIA_S3_PUBLIC_BASE_URL")]?.trim().replace(/\/+$/, "") || null,
    },
  };
}

/** One line saying which store a run is about to touch — printed before any write. */
export function describeStore(env, store) {
  const where =
    store.driver === "local"
      ? `driver "local" (${store.localRoot})`
      : `driver "s3" (bucket "${store.settings.bucket}" at ${store.settings.endpoint})`;
  return `Store [${env.toUpperCase()}]: ${where}`;
}

/**
 * Does this DATABASE_URL point at a database on this machine? The same host
 * list `scripts/db/reset.mjs` trusts. Used as the split-brain guard: a
 * `--env prod` run whose rows go into the local Postgres while its bytes go
 * into the prod bucket has done half of what it claimed, silently — so a
 * cross-environment run refuses a local DATABASE_URL and names the procedure
 * (set the environment's DATABASE_URL in the shell, exactly like
 * `user-create` in docs/DEPLOY.md).
 */
export function isLocalDatabaseUrl(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]", "db", "postgres"].includes(host);
  } catch {
    return true;
  }
}
