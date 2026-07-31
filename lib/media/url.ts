// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Where a browser fetches an item from.
//
// ── The one rule ───────────────────────────────────────────────────────────
// **The bytes come from the bucket, not from this app.** On a successful app
// that is the difference between a node serving pages and a node serving
// megabytes; with video it stops being a preference at all, because a player
// seeking through a recording issues range requests and the bucket answers
// those by itself. Routing them through the app would mean implementing
// `206 Partial Content` — on every node, for every viewer.
//
// ── Why access is decided HERE and not at fetch time ───────────────────────
// Because `next/image` will not follow a redirect to a foreign host. A delivery
// route that answers `307` with a signed URL works for a download and fails for
// an `<Image>`. So the server component that renders the item decides who is
// asking — it already knows, it is the same place `hasPlan()` decides
// everything else — and mints an address that expires. The check moves from
// fetch time to render time, which is what makes bucket-direct delivery
// possible at all (AD-34).
//
// ── The local driver is the exception, and it says so ──────────────────────
// On `MEDIA_DRIVER=local` there is no address a browser can reach that is not
// this app, so everything goes through `app/api/media/[id]`. That is DEV only.
// It also means the two drivers exercise different delivery paths, which is
// worth knowing before concluding from a working local setup that production
// will behave the same.
import { mediaConfig } from "./config";
import type { MediaRow } from "@/db/schema-media";
import { safeFilename, extensionFor, type MediaKind } from "./rules";
import { mediaStore } from "./store";

export interface MediaUrlOptions {
  /** Serve as a download, with the name the file was uploaded under. */
  download?: boolean;
}

/** The route this app serves media from when the driver has no public address. */
export function appMediaPath(id: string, download = false): string {
  return `/api/media/${id}${download ? "?download=1" : ""}`;
}

/** How long a minted address for this kind stays valid. */
export function signedUrlSeconds(kind: MediaKind): number {
  return mediaConfig().kinds[kind].signedUrlSeconds;
}

/**
 * The address for an item whose access has ALREADY been decided.
 *
 * **This function grants nothing and checks nothing.** It is the last step
 * after `mayAccess()` said yes, and calling it without that check is how a
 * private file becomes a public one. The name is deliberately not
 * `getMediaUrl` for that reason: a caller should have to notice.
 */
export function mediaUrlFor(row: MediaRow, options: MediaUrlOptions = {}): string {
  const store = mediaStore();

  // Product imagery, on a bucket that serves anonymous reads: the plain
  // address. Cacheable by the CDN, identical for every visitor, and it never
  // expires — which is right for something anybody may see anyway.
  if (row.visibility === "public" && !options.download) {
    const url = store.publicUrl(row.storageKey);
    if (url) return url;
  }

  const signed = store.signedUrl(row.storageKey, {
    expiresSeconds: signedUrlSeconds(row.kind),
    contentType: row.mime,
    downloadFilename: options.download
      ? safeFilename(row.filename ?? "", extensionFor(row.mime))
      : undefined,
  });
  if (signed) return signed;

  // `local`: nothing but this app can serve it.
  return appMediaPath(row.id, options.download);
}
