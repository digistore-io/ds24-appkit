// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Which hosts `next/image` is allowed to fetch from.
//
// ── Why this is a file of its own ──────────────────────────────────────────
// It is read by `next.config.ts`, which is loaded before the app exists and
// outside the app's module graph — no `@/` alias, no database, no product
// registry. Anything this file imports would be pulled into that moment, so it
// imports nothing at all. The rest of the media layer lives in `url.ts`, which
// is free to depend on the app.
//
// ── What it is for ─────────────────────────────────────────────────────────
// Media is served from the bucket rather than from the app, and `next/image`
// refuses to optimise an image from a host it was not told about. The refusal
// is a 400 at request time rather than a build error — so the symptom is a page
// of broken images in production and a perfect one in development, where the
// local driver serves everything from the app's own origin.

/**
 * The bucket hosts, from the environment.
 *
 * Both variables are read because they can differ: `MEDIA_S3_ENDPOINT` is where
 * the app writes, and `MEDIA_S3_PUBLIC_BASE_URL` is where a browser reads —
 * a CDN or a custom domain in front of the same bucket.
 *
 * A malformed value is skipped rather than thrown on. This runs while the
 * config is being loaded, and taking the build down over a typo in an optional
 * variable would be a worse failure than the one it prevents;
 * `node run.mjs media-check` is where that gets reported.
 */
export function imageHostsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set<string>();
  for (const value of [env.MEDIA_S3_PUBLIC_BASE_URL, env.MEDIA_S3_ENDPOINT]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      hosts.add(new URL(trimmed).host);
    } catch {
      // Reported by the check command, not here.
    }
  }
  return [...hosts];
}
