// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Which product set THIS instance sells — the impure half of the environment
// axis, deliberately OUTSIDE the exported core: `lib/digistore/products.ts`
// must stay pure (scripts/core/purity.test.ts), so it takes the environment
// as a parameter and this module is where the app reads it from APP_ENV.
import { appEnv } from "@/lib/env-guard";
import type { SyncEnv } from "./products";

/**
 * The running instance's product environment, from APP_ENV. Unknown values
 * count as production (`appEnv`), so a misconfigured deploy sells the live
 * set — the strictest answer, and the one that costs no real sale.
 */
export function runtimeSyncEnv(): SyncEnv {
  const env = appEnv(process.env.APP_ENV);
  if (env === "development") return "dev";
  if (env === "staging") return "staging";
  return "prod";
}
