// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    server: {
      deps: {
        // next-auth's ESM files import "next/server" without an extension.
        // Next itself is always consumed through a bundler where that
        // resolves; Node's native ESM resolver — which vitest uses for
        // externalized node_modules — refuses it. Inlining routes next-auth
        // through vite's resolver instead, so proxy.test.ts can execute the
        // real middleware wiring rather than only reading its source.
        inline: ["next-auth"],
      },
    },
  },
});
