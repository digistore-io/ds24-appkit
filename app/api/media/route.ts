// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Taking an upload in.
//
// ── It guards itself, and it has to ────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` and nothing else, so everything under
// `app/api/` is PUBLIC until it protects itself. Same rule as
// `app/api/chat/route.ts` and `app/api/account/export/route.ts`.
//
// ── The one property that makes this safe ──────────────────────────────────
// **The owner is the session's member and nothing else.** There is no
// `ownerId` field to send. A route handler is an HTTP endpoint of its own, so
// an owner taken from the form would let anybody file an upload under somebody
// else's account — and then read it back, because `owner` visibility is
// exactly "whoever the row says". The same guarantee `spendTokens()` gives by
// taking no member id.
//
// ── Why the bytes travel through the app ───────────────────────────────────
// Because this is where they are checked: the type is read from the bytes
// rather than believed, and an image's location data is stripped before
// anything is stored. That costs one pass through the process per file, once,
// and it is the reason a customer cannot put an executable where the app will
// later hand it to another customer.
//
// It also sets the ceiling. Several hundred megabytes through a route handler
// is not an upload, it is an outage — the hosts cap the request body and the
// process buffers what it is checking. The way past that ceiling is the browser
// writing straight to the bucket, which is deliberately not built yet; the
// refusal below names the limit and `docs/visuals.md` says what the other path
// involves.
import { currentActiveUser } from "@/lib/authz";
import { isMediaEnabled, mediaConfig } from "@/lib/media/config";
import { acceptUpload } from "@/lib/media/manage";
import { MediaError, formatBytes, kindForMime, type MediaErrorCode } from "@/lib/media/rules";
import { mediaStoreProblems } from "@/lib/media/store";
import { forgetOne, isLimited, record } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media-upload";

function refuse(code: MediaErrorCode, status: number, detail?: string): Response {
  return Response.json({ error: code, detail }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // 1. Who is asking. "Not signed in" and "blocked" both answer 401 — a caller
  //    with no session has no business learning which of the two they are.
  const current = await currentActiveUser();
  if (current.state !== "active") return refuse("notSignedIn", 401);
  const memberId = current.session.user.id;
  if (!memberId) return refuse("notSignedIn", 401);
  const role = current.session.user.role ?? "member";

  // 2. Is the feature on, and is there anywhere to put things? The second half
  //    matters: a store that is not configured fails at the PUT, which is after
  //    the request body has already been read.
  if (!isMediaEnabled()) return refuse("storeUnavailable", 503);
  const storeProblems = mediaStoreProblems();
  if (storeProblems.length > 0) {
    console.error("[media] the store is not usable:", storeProblems);
    return refuse("storeUnavailable", 503);
  }

  const config = mediaConfig();

  // 3. The brake, metered per member. Before the body is read, because reading
  //    it is the expensive part and a limit that fires afterwards has already
  //    paid for what it is refusing.
  const limit = { max: config.maxUploadsPerHour, windowMs: 60 * 60 * 1000 };
  if (isLimited(BUCKET, memberId, limit)) return refuse("rateLimited", 429);

  // Counted HERE, before the body is read — not after the checks below.
  // It used to sit past the size refusal, so the requests that cost the most
  // were the only ones the brake never saw: a member could loop 49 MB parts and
  // every one was fully buffered, refused, and not counted. A refused request
  // still consumed the thing this limit protects.
  record(BUCKET, memberId, limit);

  // 4. Get the file out of the request.
  //
  //    A request that turns out to carry no file gets its slot BACK. Counting
  //    before the read is right for the reason above, and it also metered the
  //    one case that costs nothing — an empty POST. A form bug or a client retry
  //    loop could then lock a member out for an hour without a byte having been
  //    uploaded, and there is no way for them to clear it. `forgetOne()` gives
  //    back exactly the hit recorded above; it is not `clearKey()`, which would
  //    turn an empty request into a quota reset.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    forgetOne(BUCKET, memberId);
    return refuse("noFile", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    forgetOne(BUCKET, memberId);
    return refuse("noFile", 400);
  }

  // 5. A size refusal from the part's declared length. NOT a check on its own —
  //    `acceptUpload` measures what actually arrived — and NOT free either:
  //    `request.formData()` above has already read the body, which is the
  //    ceiling this endpoint has and the reason the direct-to-bucket path
  //    exists (docs/visuals.md). It is here to give an oversized upload a
  //    message that names the limit rather than a generic refusal.
  const declaredKind = kindForMime(config, file.type || "");
  const ceiling = declaredKind
    ? config.kinds[declaredKind].maxBytes
    : Math.max(...Object.values(config.kinds).map((k) => k.maxBytes));
  if (file.size > ceiling) {
    return refuse("tooLarge", 413, `max ${formatBytes(ceiling)}`);
  }

  // 6. And now the real checks: what the bytes ARE, whether this role may put
  //    that in, and the metadata strip. All of it in `lib/media/manage.ts`.
  try {
    const row = await acceptUpload({
      ownerId: memberId,
      role,
      bytes: new Uint8Array(await file.arrayBuffer()),
      claimedMime: file.type || null,
      filename: file.name || null,
      // Visibility is deliberately NOT read from the form. A customer must not
      // be able to publish their own upload, and they must certainly not be
      // able to file one as `entitled` and hand themselves paid content. An app
      // that needs those calls `createMedia()` from a Server Action of its own,
      // where an operator check can sit in front of it.
      visibility: "owner",
      alt: typeof form.get("alt") === "string" ? (form.get("alt") as string) : null,
    });

    return Response.json(
      { id: row.id, kind: row.kind, mime: row.mime, bytes: row.bytes },
      { status: 201, headers: { "cache-control": "no-store, private" } },
    );
  } catch (error) {
    if (error instanceof MediaError) {
      const status =
        error.code === "tooLarge" ? 413 : error.code === "notAllowedForRole" ? 403 : 400;
      const detail =
        error.code === "tooLarge" && declaredKind
          ? `max ${formatBytes(config.kinds[declaredKind].maxBytes)}`
          : undefined;
      return refuse(error.code, status, detail);
    }
    // A store that refused the write. The message carries the provider's own
    // error code, which is the difference between "wrong key", "no such bucket"
    // and "clock skew" — it belongs in the log, never in the response.
    console.error("[media] upload failed:", error);
    return refuse("storeUnavailable", 502);
  }
}
