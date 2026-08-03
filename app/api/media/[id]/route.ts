// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Handing one item out — the browser's door.
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
// ── It guards itself ───────────────────────────────────────────────────────
// `proxy.ts` matches `/dashboard/:path*` only, so everything under `app/api/`
// is public until it protects itself. The refusal semantics — 404 for missing
// AND forbidden, 503 for a broken store — live in the shared pipeline
// (`lib/media/deliver.ts`), which `app/api/v1/media/[id]` enters too; this
// route only says who is looking, and only when the item is not public.
import { currentActiveUser } from "@/lib/authz";
import { deliverMedia } from "@/lib/media/deliver";
import type { Viewer } from "@/lib/media/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return deliverMedia({
    id,
    download: new URL(request.url).searchParams.has("download"),
    // Called only for non-public items — a product image on a public page
    // must not cost a session lookup.
    viewerFor: async (): Promise<Viewer> => {
      const current = await currentActiveUser();
      if (current.state !== "active") return { memberId: null, role: null };
      return {
        memberId: current.session.user.id ?? null,
        role: current.session.user.role ?? null,
      };
    },
  });
}
