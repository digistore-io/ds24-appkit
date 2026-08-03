// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Handing one Knowledge Media file out — to the signed-in, and to nobody else.
//
// ── The sibling of `/api/media/[id]`, with three deliberate differences ─────
// Same skeleton, same refusal philosophy, same store port — but no feature
// switch (the route exists whenever the app runs, FR-173), no database (the
// PATH is the identity, and the grammar in `lib/knowledge-media/rules.mjs` is
// what makes an arbitrary URL segment safe to treat as one), and no visibility
// model (`currentActiveUser()` is the whole gate — v1 knowledge media belong
// to every signed-in member, so no chat suggestion ever leads to a locked
// door; entitlement gating per path prefix is a designed v2 story, do not
// build it here).
//
// ── One namespace, two legs (AD-52) ─────────────────────────────────────────
// Resolution is fixed: `content/knowledge-media/<path>` on disk first, then
// the object store under `knowledge/<path>`. Moving a file between the legs
// changes no handbook text and no marker — the URL stays the same.
//
// ── It guards itself ────────────────────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` only, so everything under `app/api/`
// is public until it protects itself.
//
// ── Why every refusal is 404, never 403 ─────────────────────────────────────
// A `404` for something that does not exist and a `403` for something that
// does would let anybody map which paths are real by trying them. So the
// signed-out, the blocked and the grammar-refused all get **404**, exactly as
// if nothing were there — the only honest refusal is indistinguishable from
// absence. The one exception is the store being down (503): that is not a
// fact about any item, it is a fact about the app, and the app may admit its
// own faults.
//
// ── Why the disk leg sends no `Accept-Ranges` ───────────────────────────────
// `lib/media/url.ts` states the rule this route inherits: a player seeking
// through a recording issues range requests and the bucket answers those by
// itself — routing them through the app would mean implementing
// `206 Partial Content` on every node, for every viewer. Anything a user
// seeks in belongs on the bucket leg (the 10 MB shipped cap makes the split
// real); the disk leg answers full-body and deliberately does not advertise
// ranges.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { currentActiveUser } from "@/lib/authz";
import {
  isValidMediaPath,
  KNOWLEDGE_MEDIA_TYPES,
  KNOWLEDGE_MEDIA_BUCKET_PREFIX,
  KNOWLEDGE_MEDIA_TTL_SECONDS,
} from "@/lib/knowledge-media/rules.mjs";
import { mediaStore, mediaStoreProblems } from "@/lib/media/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The allow-map, with the index put back on at the boundary: the `.mjs` infers
// a closed object type, and by the time this route indexes it the grammar has
// already guaranteed the extension is one of its keys.
const mediaTypes: Record<string, { contentType: string; kind: string }> =
  KNOWLEDGE_MEDIA_TYPES;

/** The full-body headers, shared by the disk leg and the local-driver leg. */
function deliveryHeaders(contentType: string, bytes: number): Record<string, string> {
  return {
    // `X-Content-Type-Options: nosniff` is set app-wide, so this has to be
    // right — the browser will not rescue a wrong type by guessing. It comes
    // from the allow-map, never sniffed, never from config/media.json (AD-56).
    "content-type": contentType,
    "content-length": String(bytes),
    // Everything on this route is session-gated, so nothing here may land in
    // a shared cache — there is no public/private fork to make.
    "cache-control": "no-store, private",
    // No `Accept-Ranges` — see the header.
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  // Guard 1: the session. Anonymous and blocked answer identically — a
  // signed-out caller has no business learning which of the two they are,
  // and neither has any business learning what exists.
  const current = await currentActiveUser();
  if (current.state !== "active") return new Response("Not found", { status: 404 });

  // Guard 2: the grammar, before any I/O. Next has already decoded each URI
  // segment; the grammar refuses anything outside its alphabet — `.` / `..`,
  // empty segments, backslashes, uppercase, a third segment, an extension not
  // in the allow-map — so the joined path cannot name anything outside the
  // two roots below. One validator, imported, never re-implemented (AD-56).
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!isValidMediaPath(path)) return new Response("Not found", { status: 404 });

  const extension = path.slice(path.lastIndexOf(".") + 1);
  const { contentType } = mediaTypes[extension];

  // ── The disk leg: `content/knowledge-media/<path>` ────────────────────────
  // The grammar has already refused `.` / `..` / empty segments, so this join
  // cannot leave the root — no second resolver needed (the same division of
  // labour `lib/media/local.ts` documents for its own lock).
  try {
    const bytes = await readFile(
      join(process.cwd(), "content", "knowledge-media", ...segments),
    );
    return new Response(bytes, {
      headers: deliveryHeaders(contentType, bytes.length),
    });
  } catch (error) {
    // Not on this leg — whatever the reason, and that "whatever" is the point.
    //
    // ENOENT is the ordinary miss; ENOTDIR/EISDIR mean a stray directory or
    // file is squatting where the grammar expects the other. An allow-list of
    // those three used to rethrow everything else, and everything else is
    // reachable from a URL: ENAMETOOLONG on a 300-character segment that is
    // perfectly grammar-valid, ELOOP on a symlink cycle in the shipped tree,
    // EACCES on a file the process may not read. Each of those turned into a
    // 500 a signed-in member could SELECT by typing — and the header of this
    // file promises that every refusal is indistinguishable from absence. A
    // 500 is distinguishable, so it was a way to map which paths are real.
    //
    // So: every fs error means "no servable file on this leg" and falls
    // through to the bucket. The unexpected codes are logged, because an
    // operator wants to know about an unreadable file even though the member
    // never may.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR" && code !== "EISDIR") {
      console.error(
        `[knowledge-media] the disk leg failed unexpectedly (${code ?? "no code"}) for "${path}":`,
        error,
      );
    }
  }

  // ── The bucket leg: the store under `knowledge/<path>` ────────────────────
  // The store check sits HERE, not at the top: the disk leg never touches the
  // store, and a broken bucket config must not take shipped files down with
  // it. `mediaStore()` throws on a half-configured s3 driver, which is why
  // the problems check runs before it — the alternative was a 500 with a
  // stack trace on every fetch. 503 and never a fake 404: withholding
  // EXISTENCE is what this route is careful about, and the store being down
  // is not a fact about any item.
  const problems = mediaStoreProblems();
  if (problems.length > 0) {
    console.error("[knowledge-media] the store is not usable:", problems);
    return new Response("Storage unavailable", { status: 503 });
  }

  const store = mediaStore();

  // The cloud driver: send them to the bucket. The signature pins the media
  // type, and the URL dies after KNOWLEDGE_MEDIA_TTL_SECONDS — the bytes
  // never pass through the app, and seeking is the bucket's job.
  const signed = store.signedUrl(KNOWLEDGE_MEDIA_BUCKET_PREFIX + path, {
    expiresSeconds: KNOWLEDGE_MEDIA_TTL_SECONDS,
    contentType,
  });
  if (signed) {
    return new Response(null, {
      status: 307,
      headers: { location: signed, "cache-control": "no-store, private" },
    });
  }

  // The local driver: `signedUrl()` returning null is not an error, it is the
  // driver saying "there is no third party serving these bytes" — so this app
  // serves them, because in DEV nothing else can. `pathFor()` inside local.ts
  // is the second lock behind the grammar; neither relies on the other.
  const bytes = await store.getBytes(KNOWLEDGE_MEDIA_BUCKET_PREFIX + path);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(bytes), {
    headers: deliveryHeaders(contentType, bytes.length),
  });
}
