// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The one entry point to wherever this app's media lives.
//
// Nothing above this file knows which driver answered, the same way no call
// site of `runTask()` knows which AI company answered. `lib/media/s3.ts` and
// `lib/media/local.ts` are the only files that read a storage credential, which
// is the arrangement `lib/ai/providers/registry.ts` already has.
//
// ── The driver is decided by the environment, once ─────────────────────────
// `MEDIA_DRIVER=s3` is what anything online uses; `local` is a DEV convenience
// and `lib/env-guard.ts` refuses to start the app with it anywhere else. An
// unknown value **throws** rather than falling back — the same refusal
// `scripts/db/driver.mjs` makes, and for the same reason: quietly starting the
// wrong store is how an app ends up writing customer files somewhere nobody
// intended and nobody backs up.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Server components, Server Actions, route handlers, scripts. Never a client
// component — it reads the environment.
import { createLocalStore, localDirFromEnv } from "./local";
import { createS3Store, s3SettingsFromEnv } from "./s3";

export type MediaDriver = "local" | "s3";

export interface SignedUrlOptions {
  expiresSeconds: number;
  /** Present for a download: the name the browser should save it as. */
  downloadFilename?: string;
  /** The media type recorded for the item, restated so the bucket returns it. */
  contentType?: string;
}

/**
 * What every driver can do.
 *
 * Deliberately small. There is no `list`, no `copy` and no `move`: this app
 * knows what it stored because it wrote a row, and a store that can be
 * enumerated is one somebody will enumerate instead of querying the database —
 * at which point the row and the object have two sources of truth.
 */
export interface MediaStore {
  readonly driver: MediaDriver;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  head(key: string): Promise<{ bytes: number } | null>;
  getBytes(key: string): Promise<Uint8Array | null>;
  /** An address anybody may fetch, or null when this driver has none. */
  publicUrl(key: string): string | null;
  /** A short-lived address, or null when this driver has none (local). */
  signedUrl(key: string, options: SignedUrlOptions): string | null;
}

export function driverFromEnv(env: NodeJS.ProcessEnv = process.env): MediaDriver {
  const value = (env.MEDIA_DRIVER ?? "").trim().toLowerCase();
  // Empty means "nobody chose", and in DEV that is the ordinary state of a
  // fresh clone. `lib/env-guard.ts` is what makes it impossible anywhere else,
  // so this default cannot become a production default by accident.
  if (value === "" || value === "local") return "local";
  if (value === "s3") return "s3";
  throw new Error(
    `MEDIA_DRIVER="${value}" is not a driver. Use "s3" for anything that goes ` +
      `online, or "local" for development. See docs/visuals.md.`,
  );
}

let cached: MediaStore | null = null;

/**
 * The store this installation uses.
 *
 * Cached per process, because building it reads the environment and the answer
 * cannot change while the process runs.
 */
export function mediaStore(): MediaStore {
  if (cached) return cached;

  if (driverFromEnv() === "s3") {
    const settings = s3SettingsFromEnv();
    if (!settings) {
      throw new Error(
        "MEDIA_DRIVER=s3 but the bucket is not configured. Needs " +
          "MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and " +
          "MEDIA_S3_SECRET_ACCESS_KEY. Check it with: node run.mjs media-check",
      );
    }
    cached = createS3Store(settings);
  } else {
    cached = createLocalStore(localDirFromEnv());
  }

  return cached;
}

/** Test seam, and the way a script switches store mid-run. */
export function resetMediaStore(): void {
  cached = null;
}

/** Is the store configured well enough to be used? For the check command and the guards. */
export function mediaStoreProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  try {
    if (driverFromEnv(env) === "s3" && !s3SettingsFromEnv(env)) {
      return [
        "MEDIA_DRIVER=s3, but MEDIA_S3_ENDPOINT / MEDIA_S3_BUCKET / " +
          "MEDIA_S3_ACCESS_KEY_ID / MEDIA_S3_SECRET_ACCESS_KEY are not all set",
      ];
    }
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  return [];
}
