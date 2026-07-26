// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The cookie names from lib/auth/cookie-names.ts only help if they actually
// reach Auth.js. They did not for a long time: `devCookies(...)` was computed
// in auth.config.ts and then never handed to the exported config — so locally
// the Auth.js defaults were in force after all, and a leftover
// `authjs.session-token` from another app on localhost produced
// "JWTSessionError: no matching decryption secret" on every page load.
//
// That is why the wiring is tested here and not just the pure function.
import { afterEach, describe, expect, it, vi } from "vitest";
import { installationFingerprint } from "@/lib/auth/cookie-names";

const SECRET = "0123456789abcdef0123456789abcdef";

/** Loads auth.config.ts freshly with the given env (it reads it at import time). */
async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return (await import("./auth.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("auth.config cookie names", () => {
  it("carries the fingerprinted names locally", async () => {
    const config = await loadConfig({
      APP_ENV: "development",
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: SECRET,
    });

    const fingerprint = installationFingerprint(SECRET);
    expect(config.cookies?.sessionToken?.name).toBe(
      `authjs.session-token.${fingerprint}`,
    );
    expect(config.cookies?.callbackUrl?.name).toBe(
      `authjs.callback-url.${fingerprint}`,
    );
    expect(config.cookies?.csrfToken?.name).toBe(
      `authjs.csrf-token.${fingerprint}`,
    );
  });

  it("leaves the Auth.js defaults alone in a real environment", async () => {
    const config = await loadConfig({
      APP_ENV: "production",
      APP_URL: "https://app.example.com",
      AUTH_SECRET: SECRET,
    });

    expect(config.cookies).toBeUndefined();
  });
});
