// Cron endpoint: delete IPN-log rows older than the retention window.
//
// The IPN log keeps the full raw payload (buyer PII), so it must not grow
// forever — see lib/digistore/ipn-log.ts. A scheduler (the host's cron, Vercel
// Cron, a system crontab hitting this URL) calls this once a day; the same work
// is available offline as `node run.mjs db-prune-ipn` (scripts/db/prune-ipn-log.mjs).
//
// This route is PUBLIC as far as the proxy matcher is concerned (it guards only
// /dashboard) — like /api/ipn. It protects itself instead, with a bearer token:
// set CRON_SECRET and send `Authorization: Bearer <CRON_SECRET>`. Without the
// secret configured the endpoint refuses to run at all (fail closed), so it
// cannot be left as an open "delete my logs" URL by accident.
import crypto from "node:crypto";

import { pruneIpnEvents, IPN_LOG_RETENTION_DAYS } from "@/lib/digistore/ipn-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret, no run
  const header = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  // Constant-time compare; length guard first so timingSafeEqual never throws.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    // Distinguish "not configured" (503) from "wrong token" (401) so an
    // operator can tell a missing secret from a bad one.
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deleted = await pruneIpnEvents();
  return Response.json({ deleted, retentionDays: IPN_LOG_RETENTION_DAYS });
}

// Accept GET (most platform schedulers) and POST (a plain curl in a crontab).
export const GET = handle;
export const POST = handle;
