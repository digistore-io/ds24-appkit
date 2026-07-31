// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Handing one item out.
//
// ── This is not the main delivery path, and that is the design ─────────────
// Pages render media through `lib/media/url.ts`, which sends the browser to the
// bucket. This route exists for two narrower jobs:
//
//   1. **Downloads.** A link somebody clicks, which has to carry the filename
//      they uploaded rather than the storage key.
//   2. **The local driver.** In DEV there is no bucket, so there is no address
//      a browser can reach that is not this app.
//
// On the cloud driver it therefore answers `307` to a signed address and the
// bytes still never pass through the app. On the local driver it streams,
// because in DEV nothing else can.
//
// ── It guards itself ───────────────────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` only, so everything under `app/api/`
// is public until it protects itself.
//
// ── Why a missing item and a forbidden one answer differently ──────────────
// A `404` for something that does not exist and a `403` for something that does
// would let anybody map which ids are real by trying them. So an item the
// caller may not have answers **404**, exactly as if it were not there — the
// only case that gets a `403` is the one where knowing is already established.
import { currentActiveUser } from "@/lib/authz";
import { isMediaEnabled } from "@/lib/media/config";
import { findMedia, mayAccess } from "@/lib/media/manage";
import { safeFilename, extensionFor } from "@/lib/media/rules";
import { mediaStore, mediaStoreProblems } from "@/lib/media/store";
import { signedUrlSeconds } from "@/lib/media/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isMediaEnabled()) return new Response("Not found", { status: 404 });

  // The upload route checks this and this one did not, so an unknown
  // MEDIA_DRIVER or a half-configured bucket threw out of the handler — a 500
  // with a stack trace on every media fetch.
  //
  // **503, the same answer the upload route gives the same condition.** It was
  // 404 for one release, on the reasoning that this route says nothing to
  // anybody — and that made "the operator mistyped the bucket key" identical to
  // "the row was deleted" and to "you may not have this". Every picture in the
  // app then returned exactly what a correctly-refused stranger returns, which
  // is the one thing nobody can debug. Withholding EXISTENCE is what this route
  // is careful about; the store being down is not a fact about any item, it is
  // a fact about the app, and the app may admit its own faults.
  const problems = mediaStoreProblems();
  if (problems.length > 0) {
    console.error("[media] the store is not usable:", problems);
    return new Response("Storage unavailable", { status: 503 });
  }

  const { id } = await context.params;
  const row = await findMedia(id);
  if (!row) return new Response("Not found", { status: 404 });

  // Public items need no session at all — that is what makes them public, and
  // asking for one would put a session lookup in front of every product image
  // on a page a signed-out visitor is looking at.
  let viewer = { memberId: null as string | null, role: null as string | null };
  if (row.visibility !== "public") {
    const current = await currentActiveUser();
    if (current.state === "active") {
      viewer = {
        memberId: current.session.user.id ?? null,
        role: current.session.user.role ?? null,
      };
    }
  }

  if (!(await mayAccess(row, viewer))) {
    // 404, not 403. See the header.
    return new Response("Not found", { status: 404 });
  }

  const download = new URL(request.url).searchParams.has("download");
  const store = mediaStore();

  // The cloud driver: send them to the bucket. The signature carries the
  // filename and the media type, so neither can be edited onto the URL by
  // whoever receives it.
  const signed = store.signedUrl(row.storageKey, {
    expiresSeconds: signedUrlSeconds(row.kind),
    contentType: row.mime,
    downloadFilename: download
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
  if (download) {
    headers["content-disposition"] =
      `attachment; filename="${safeFilename(row.filename ?? "", extensionFor(row.mime))}"`;
  }

  return new Response(Buffer.from(bytes), { headers });
}
