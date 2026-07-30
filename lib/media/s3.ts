// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The object-storage driver. One implementation, five providers.
//
// Amazon S3, DigitalOcean Spaces, Cloudflare R2, Backblaze B2 and Hetzner
// Object Storage all speak the same dialect, so what separates them is an
// endpoint and a region — the same arrangement `lib/ai/providers/openai-compat.ts`
// has with OpenAI, Mistral and OpenRouter, and for the same reason: one code
// path that five vendors exercise is one code path that stays correct.
//
// ── This file and `local.ts` are the only ones that read a storage credential ─
// Everything above them takes a `MediaStore` and does not know which it has.
//
// ── Two decisions worth knowing before changing anything here ──────────────
//
// **We never send an ACL header.** `x-amz-acl: public-read` is an S3-ism:
// Cloudflare R2 has no ACLs at all and Backblaze handles it differently. So
// whether the bucket serves anonymous reads is a property the operator
// configured — a bucket policy, a public dev URL, a custom domain — and the app
// learns the resulting address from `MEDIA_S3_PUBLIC_BASE_URL`. With no such
// address configured, `public` items are still served, through a signed URL
// like everything else. That is slower to cache and completely correct, which
// is the right way round for a default.
//
// **Addressing is derived, not configured.** Buckets can be addressed as
// `https://bucket.host/key` or `https://host/bucket/key`, providers disagree
// about which they prefer, and a wrong guess is a 404 with no explanation. So
// the endpoint is inspected: if its host already begins with the bucket name,
// the key is the whole path; otherwise the bucket is the first path segment.
// R2 and Backblaze hand you an endpoint without the bucket, AWS and Spaces let
// you use either, and all four therefore work with nothing extra to set.
import {
  credentialsFor,
  objectPath as objectPathRaw,
  s3SettingsFromEnv as settingsFromEnvRaw,
  sendS3,
} from "./s3-request.mjs";
import { presignUrl } from "./sigv4";
import type { MediaStore, SignedUrlOptions } from "./store";

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Where anonymous readers fetch public objects, if the bucket serves them. */
  publicBaseUrl: string | null;
}

/**
 * Reads the settings out of the environment. Null when they are incomplete.
 *
 * Typed re-export: the implementation is in `s3-request.mjs`, so that
 * `node run.mjs media-check` proves the path the app really uses rather than a
 * second one that happens to agree.
 */
export const s3SettingsFromEnv: (env?: NodeJS.ProcessEnv) => S3Settings | null =
  settingsFromEnvRaw;

/** The path a key gets, given how this endpoint addresses its bucket. */
export const objectPath: (settings: S3Settings, key: string) => string = objectPathRaw;

export function createS3Store(settings: S3Settings): MediaStore {
  const credentials = credentialsFor(settings);

  const send = (
    method: string,
    key: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Response> => sendS3(settings, method, key, body, contentType);

  return {
    driver: "s3",

    async put(key, body, contentType) {
      const response = await send("PUT", key, body, contentType);
      if (!response.ok) {
        // The body carries S3's own `<Code>` element, and it is the difference
        // between "wrong key", "no such bucket" and "clock skew". Losing it
        // costs an hour every time.
        throw new Error(
          `media: PUT ${key} failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
        );
      }
    },

    async remove(key) {
      const response = await send("DELETE", key);
      // A delete of something already gone is a success, not an error — it is
      // the state the caller asked for. S3 answers 204 either way; other
      // providers occasionally answer 404, and treating that as a failure would
      // make account deletion fail on a retry.
      if (!response.ok && response.status !== 404) {
        throw new Error(`media: DELETE ${key} failed (${response.status})`);
      }
    },

    async head(key) {
      const response = await send("HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`media: HEAD ${key} failed (${response.status})`);
      return { bytes: Number(response.headers.get("content-length") ?? 0) };
    },

    async getBytes(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`media: GET ${key} failed (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },

    publicUrl(key) {
      return settings.publicBaseUrl ? `${settings.publicBaseUrl}/${key}` : null;
    },

    signedUrl(key, options: SignedUrlOptions) {
      const query: Record<string, string> = {};
      if (options.downloadFilename) {
        // This is how a download gets the name the customer uploaded rather
        // than the storage key. It is part of the SIGNATURE, so it cannot be
        // edited onto a URL by whoever received it.
        query["response-content-disposition"] =
          `attachment; filename="${options.downloadFilename}"`;
      }
      if (options.contentType) {
        // `X-Content-Type-Options: nosniff` is set app-wide, and a browser will
        // not rescue a wrong type by guessing. Stating it here means the bucket
        // returns what we recorded rather than whatever it inferred at upload.
        query["response-content-type"] = options.contentType;
      }

      return presignUrl({
        method: "GET",
        endpoint: settings.endpoint,
        path: objectPath(settings, key),
        query,
        credentials,
        expiresSeconds: options.expiresSeconds,
        now: new Date(),
      });
    },
  };
}
