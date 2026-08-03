// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Handing one item out — the delivery pipeline both media doors share.
//
// `app/api/media/[id]/route.ts` (session cookie) and
// `app/api/v1/media/[id]/route.ts` (bearer key) answer the who-question and
// then come HERE. The refusal semantics below are documented invariants, and
// having them once is what keeps the two doors from drifting apart:
//
// ── Why a missing item and a forbidden one answer the same ─────────────────
// A `404` for something that does not exist and a `403` for something that
// does would let anybody map which ids are real by trying them. So an item the
// caller may not have answers **404**, exactly as if it were not there.
//
// ── Why a broken store is 503, not 404 ─────────────────────────────────────
// It was 404 for one release, on the reasoning that this route says nothing to
// anybody — and that made "the operator mistyped the bucket key" identical to
// "the row was deleted" and to "you may not have this". Every picture in the
// app then returned exactly what a correctly-refused stranger returns, which
// is the one thing nobody can debug. Withholding EXISTENCE is what this path
// is careful about; the store being down is not a fact about any item, it is
// a fact about the app, and the app may admit its own faults.
//
// ── Delivery shape ─────────────────────────────────────────────────────────
// On the cloud driver: `307` to a signed address, the bytes never pass
// through the app. On the local driver (DEV): stream, because nothing else
// can serve them.
import { isMediaEnabled } from "@/lib/media/config";
import { findMedia, mayAccess, type Viewer } from "@/lib/media/manage";
import { safeFilename, extensionFor } from "@/lib/media/rules";
import { mediaStore, mediaStoreProblems } from "@/lib/media/store";
import { signedUrlSeconds } from "@/lib/media/url";

/**
 * Delivers one item to a viewer the caller still has to name.
 *
 * `viewerFor` is a CALLBACK, not a value, so a public item costs no session
 * lookup: it is only called when the row's visibility demands one. The session
 * door resolves a cookie there; the API door already holds the key's member
 * and returns it directly.
 */
export async function deliverMedia(args: {
  id: string;
  download: boolean;
  viewerFor: () => Promise<Viewer>;
}): Promise<Response> {
  if (!isMediaEnabled()) return new Response("Not found", { status: 404 });

  // **503, the same answer the upload path gives the same condition** — see
  // the header for why this must not be 404.
  const problems = mediaStoreProblems();
  if (problems.length > 0) {
    console.error("[media] the store is not usable:", problems);
    return new Response("Storage unavailable", { status: 503 });
  }

  const row = await findMedia(args.id);
  if (!row) return new Response("Not found", { status: 404 });

  // Public items need no viewer at all — that is what makes them public, and
  // resolving one would put a session lookup in front of every product image
  // on a page a signed-out visitor is looking at.
  const viewer: Viewer =
    row.visibility === "public"
      ? { memberId: null, role: null }
      : await args.viewerFor();

  if (!(await mayAccess(row, viewer))) {
    // 404, not 403. See the header.
    return new Response("Not found", { status: 404 });
  }

  const store = mediaStore();

  // The cloud driver: send them to the bucket. The signature carries the
  // filename and the media type, so neither can be edited onto the URL by
  // whoever receives it.
  const signed = store.signedUrl(row.storageKey, {
    expiresSeconds: signedUrlSeconds(row.kind),
    contentType: row.mime,
    downloadFilename: args.download
      ? safeFilename(row.filename ?? "", extensionFor(row.mime))
      : undefined,
  });
  if (signed) {
    return new Response(null, {
      status: 307,
      headers: { location: signed, "cache-control": "no-store, private" },
    });
  }

  // The local driver: there is nothing else that can serve it.
  const bytes = await store.getBytes(row.storageKey);
  if (!bytes) {
    // The row says there is a file and there is not. Worth a log line: it means
    // somebody emptied the folder, or — the case this template refuses to allow
    // outside DEV — the app is running on a second node with its own disk.
    console.error(`[media] ${row.id}: no object at ${row.storageKey}`);
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    // `X-Content-Type-Options: nosniff` is set app-wide, so this has to be
    // right — the browser will not rescue a wrong type by guessing.
    "content-type": row.mime,
    "content-length": String(bytes.length),
    "cache-control":
      row.visibility === "public" ? "public, max-age=3600" : "no-store, private",
  };
  if (args.download) {
    headers["content-disposition"] =
      `attachment; filename="${safeFilename(row.filename ?? "", extensionFor(row.mime))}"`;
  }

  return new Response(Buffer.from(bytes), { headers });
}
