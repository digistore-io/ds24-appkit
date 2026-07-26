// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Liveness — no dependencies, must always return 200 quickly.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
