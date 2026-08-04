// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  SYNC_ENVS,
  syncEnvFromAppEnv,
  resolveSyncEnv,
  internalName,
  overlongKeys,
  displayName,
  appUrlForEnv,
  envScopedKey,
  NAME_INTERN_MAX,
} from "./_env.mjs";
import { appEnv } from "@/lib/env-guard";
import { SYNC_ENVS as APP_SYNC_ENVS } from "@/lib/digistore/products";

// The .mjs defaults its `env` parameters to process.env, so TS infers
// NodeJS.ProcessEnv — the fixtures here are honest subsets of it.
const env = (o: Record<string, string> = {}) => o as NodeJS.ProcessEnv;

// The twin rule, twice over: `syncEnvFromAppEnv` is the `.mjs` twin of
// `appEnv()` (lib/env-guard.ts), and SYNC_ENVS exists once for the scripts
// and once for the app (lib/digistore/products.ts, which must stay pure and
// cannot be imported from plain `.mjs`). This file pins both pairs.

describe("syncEnvFromAppEnv — the twin of appEnv()", () => {
  it("answers the same as appEnv() for every input", () => {
    const cases = [
      undefined,
      "",
      "  ",
      "development",
      "dev",
      "local",
      "DEV",
      "staging",
      "test",
      "Staging",
      "production",
      "prod",
      "live",
      "anything-unknown",
    ];
    const toSyncEnv = { development: "dev", staging: "staging", production: "prod" };
    for (const value of cases) {
      expect(syncEnvFromAppEnv(value), String(value)).toBe(toSyncEnv[appEnv(value)]);
    }
  });

  it("shares the env list with the app side", () => {
    expect(SYNC_ENVS).toEqual([...APP_SYNC_ENVS]);
  });
});

describe("resolveSyncEnv — --env beats APP_ENV", () => {
  it("derives from APP_ENV when no flag is given", () => {
    expect(resolveSyncEnv({}, env({ APP_ENV: "production" }))).toEqual({ env: "prod" });
    expect(resolveSyncEnv({}, env({ APP_ENV: "staging" }))).toEqual({ env: "staging" });
    expect(resolveSyncEnv({}, env())).toEqual({ env: "dev" });
  });

  it("obeys the flag over the machine's own environment", () => {
    // The whole point: a LOCAL machine syncing the prod set.
    expect(resolveSyncEnv({ env: "prod" }, env({ APP_ENV: "development" }))).toEqual({
      env: "prod",
    });
    expect(resolveSyncEnv({ env: "STAGING" }, env())).toEqual({ env: "staging" });
  });

  it("refuses a typed value it does not know instead of guessing", () => {
    // APP_ENV maps unknown → prod (strictest); a typed flag is a mistake and
    // must not silently sync a different set.
    expect(resolveSyncEnv({ env: "produktion" }, env()).error).toMatch(/produktion/);
    expect(resolveSyncEnv({ env: true }, env()).error).toMatch(/--env/);
  });
});

describe("internalName — the per-env handle", () => {
  it("carries key, language and environment", () => {
    expect(internalName("pro", "de", "dev")).toBe("pro__de__dev");
    expect(internalName("pro", "en", "prod")).toBe("pro__en__prod");
  });

  it("overlongKeys names exactly the keys that cannot fit", () => {
    const fits = "k".repeat(50); // 50 + "__xx__staging" (13) = 63
    const breaks = "k".repeat(51);
    expect(internalName(fits, "de", "staging").length).toBe(NAME_INTERN_MAX);
    expect(overlongKeys([fits, breaks], ["de", "en"])).toEqual([breaks]);
  });
});

describe("displayName — buyers see the environment, except in prod", () => {
  it("suffixes dev and staging, leaves prod clean", () => {
    expect(displayName("Basic (monthly)", "dev")).toBe("Basic (monthly) [DEV]");
    expect(displayName("Basic (monthly)", "staging")).toBe("Basic (monthly) [STAGING]");
    expect(displayName("Basic (monthly)", "prod")).toBe("Basic (monthly)");
  });
});

describe("appUrlForEnv — where an environment's URLs come from", () => {
  it("dev uses APP_URL exactly as before, missing is allowed", () => {
    expect(appUrlForEnv("dev", env({ APP_URL: "http://localhost:3000/" }))).toEqual({
      url: "http://localhost:3000",
    });
    expect(appUrlForEnv("dev", env())).toEqual({ url: null });
  });

  it("prod/staging use their dedicated keys", () => {
    expect(
      appUrlForEnv("prod", env({ APP_URL_PROD: "https://app.example.de/" })),
    ).toEqual({ url: "https://app.example.de" });
    expect(
      appUrlForEnv("staging", env({ APP_URL_STAGING: "https://stage.example.de" })),
    ).toEqual({ url: "https://stage.example.de" });
  });

  it("falls back to APP_URL only ON the environment's own host", () => {
    // A deployed prod host has APP_ENV=production and a public APP_URL — the
    // go-live flow keeps working with no new variable.
    expect(
      appUrlForEnv("prod", env({ APP_ENV: "production", APP_URL: "https://app.example.de" })),
    ).toEqual({ url: "https://app.example.de" });
    // A local machine (APP_ENV=development) gets a refusal instead — its
    // APP_URL is localhost and must stay that way (dev login).
    const local = appUrlForEnv("prod", env({
      APP_ENV: "development",
      APP_URL: "http://localhost:3000",
    }));
    expect(local.error).toMatch(/APP_URL_PROD/);
  });

  it("refuses a non-https dedicated URL by name", () => {
    const res = appUrlForEnv("prod", env({ APP_URL_PROD: "http://app.example.de" }));
    expect(res.error).toMatch(/https/);
    expect(res.error).toMatch(/APP_URL_PROD/);
  });
});

describe("envScopedKey — where a per-env value is stored", () => {
  it("keeps the plain key for the machine's own environment", () => {
    // On the prod host — and locally for a dev sync — nothing changes, which
    // is what keeps existing .env files and host secrets valid.
    expect(envScopedKey("DIGISTORE_IPN_PASSPHRASE", "dev", "dev")).toBe(
      "DIGISTORE_IPN_PASSPHRASE",
    );
    expect(envScopedKey("DIGISTORE_IPN_PASSPHRASE", "prod", "prod")).toBe(
      "DIGISTORE_IPN_PASSPHRASE",
    );
  });

  it("suffixes a foreign environment's key — the reference copy", () => {
    expect(envScopedKey("DIGISTORE_IPN_PASSPHRASE", "prod", "dev")).toBe(
      "DIGISTORE_IPN_PASSPHRASE_PROD",
    );
    expect(envScopedKey("DIGISTORE_IPN_DOMAIN_ID", "staging", "dev")).toBe(
      "DIGISTORE_IPN_DOMAIN_ID_STAGING",
    );
  });
});
