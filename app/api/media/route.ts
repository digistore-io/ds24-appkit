// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Taking an upload in — the browser's door.
//
// ── It guards itself, and it has to ────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` and nothing else, so everything under
// `app/api/` is PUBLIC until it protects itself. This route's whole job is the
// who-question: prove the session cookie, then hand member and role to the
// shared pipeline in `lib/media/upload-endpoint.ts` — which
// `app/api/v1/media` enters too, with a bearer key instead of a cookie. The
// checks, the metering and the owner binding live THERE, once.
import { currentActiveUser } from "@/lib/authz";
import { handleUpload } from "@/lib/media/upload-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // Who is asking. "Not signed in" and "blocked" both answer 401 — a caller
  // with no session has no business learning which of the two they are.
  const current = await currentActiveUser();
  if (current.state !== "active") {
    return Response.json({ error: "notSignedIn" }, { status: 401 });
  }
  const memberId = current.session.user.id;
  if (!memberId) {
    return Response.json({ error: "notSignedIn" }, { status: 401 });
  }

  return handleUpload({
    memberId,
    role: current.session.user.role ?? "member",
    request,
  });
}
