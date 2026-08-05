// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The media store's environment axis, pinned. Two properties carry the whole
// dev→prod content story and must not soften:
//
//   1. A cross-environment run NEVER falls back to the local driver — "the
//      prod store" is a bucket, and a `--env prod` quietly filling
//      `.data/media/` would be the reported bug (a live app whose content
//      only ever existed on one machine) rebuilt inside the fix.
//   2. The plain MEDIA_S3_* keys always mean THIS machine's environment; a
//      run for another environment reads the suffixed reference copies. Same
//      contract as DIGISTORE_IPN_PASSPHRASE_PROD, via the same envScopedKey.
import { describe, expect, it } from "vitest";

import {
  isLocalDatabaseUrl,
  machineEnv,
  resolveTargetEnv,
  storeForEnv,
} from "./media-env.mjs";
import { syncEnvFromAppEnv } from "../ds24/_env.mjs";

// The same fixture helper _env.test.ts uses: honest subsets of ProcessEnv.
const env = (o: Record<string, string> = {}) => o as NodeJS.ProcessEnv;

const S3 = {
  MEDIA_DRIVER: "s3",
  MEDIA_S3_ENDPOINT: "https://fra1.digitaloceanspaces.com",
  MEDIA_S3_BUCKET: "dev-bucket",
  MEDIA_S3_ACCESS_KEY_ID: "dev-key",
  MEDIA_S3_SECRET_ACCESS_KEY: "dev-secret",
};

const PROD_REFS = {
  MEDIA_S3_ENDPOINT_PROD: "https://prod.example.com",
  MEDIA_S3_BUCKET_PROD: "prod-bucket",
  MEDIA_S3_ACCESS_KEY_ID_PROD: "prod-key",
  MEDIA_S3_SECRET_ACCESS_KEY_PROD: "prod-secret",
};

describe("machineEnv", () => {
  it("is the twin of syncEnvFromAppEnv — one mapping, not two", () => {
    for (const value of ["development", "dev", "", "staging", "test", "production", "weird"]) {
      expect(machineEnv(env({ APP_ENV: value }))).toBe(syncEnvFromAppEnv(value));
    }
  });
});

describe("resolveTargetEnv", () => {
  it("takes --env out of a raw argv, else the machine's own", () => {
    expect(resolveTargetEnv(["--apply", "--env", "prod"], env({ APP_ENV: "development" }))).toEqual({
      env: "prod",
    });
    expect(resolveTargetEnv(["--apply"], env({ APP_ENV: "development" }))).toEqual({ env: "dev" });
  });

  it("refuses a typed value outside the three, and a bare --env", () => {
    expect(resolveTargetEnv(["--env", "produktion"], env()).error).toContain("produktion");
    expect(resolveTargetEnv(["--env"], env()).error).toContain("--env needs a value");
  });
});

describe("storeForEnv, this machine's environment", () => {
  it("resolves the local driver with its root", () => {
    const store = storeForEnv("dev", env({ APP_ENV: "development" }), "/app");
    expect(store).toMatchObject({ driver: "local" });
    expect((store as { localRoot: string }).localRoot.replaceAll("\\", "/")).toContain(
      ".data/media",
    );
  });

  it("resolves s3 from the plain keys", () => {
    const store = storeForEnv("dev", env({ APP_ENV: "development", ...S3 }));
    expect(store).toMatchObject({
      driver: "s3",
      settings: { bucket: "dev-bucket", region: "auto" },
    });
  });

  it("names every missing plain key", () => {
    const { error } = storeForEnv("dev", env({
      APP_ENV: "development",
      MEDIA_DRIVER: "s3",
      MEDIA_S3_ENDPOINT: "https://x.example.com",
    })) as { error: string };
    expect(error).toContain("MEDIA_S3_BUCKET");
    expect(error).toContain("MEDIA_S3_ACCESS_KEY_ID");
    expect(error).toContain("MEDIA_S3_SECRET_ACCESS_KEY");
  });

  it("refuses an unknown driver by name", () => {
    const { error } = storeForEnv("dev", env({ APP_ENV: "development", MEDIA_DRIVER: "minio" })) as {
      error: string;
    };
    expect(error).toContain('"minio"');
  });

  it("refuses an endpoint carrying a path — the 403-that-reads-like-missing trap", () => {
    const { error } = storeForEnv("dev", env({
      APP_ENV: "development",
      ...S3,
      MEDIA_S3_ENDPOINT: "https://host.example.com/bucket",
    })) as { error: string };
    expect(error).toContain("ORIGIN");
  });
});

describe("storeForEnv, another environment", () => {
  it("reads the suffixed reference keys, s3 always", () => {
    const store = storeForEnv("prod", env({ APP_ENV: "development", ...S3, ...PROD_REFS }));
    expect(store).toMatchObject({
      driver: "s3",
      settings: { bucket: "prod-bucket", endpoint: "https://prod.example.com" },
    });
  });

  it("NEVER falls back to the local driver — missing keys are named instead", () => {
    // The load-bearing refusal: MEDIA_DRIVER=local on this machine, --env
    // prod, no reference keys. A local fallback here would rebuild the
    // reported bug inside the fix.
    const { error } = storeForEnv("prod", env({ APP_ENV: "development", MEDIA_DRIVER: "local" })) as {
      error: string;
    };
    expect(error).toContain("MEDIA_S3_ENDPOINT_PROD");
    expect(error).toContain("MEDIA_S3_BUCKET_PROD");
    expect(error).toContain("MEDIA_S3_ACCESS_KEY_ID_PROD");
    expect(error).toContain("MEDIA_S3_SECRET_ACCESS_KEY_PROD");
  });

  it("keeps the plain keys meaning THIS machine — prod refs never leak into a dev run", () => {
    const store = storeForEnv("dev", env({ APP_ENV: "development", ...S3, ...PROD_REFS }));
    expect((store as { settings: { bucket: string } }).settings.bucket).toBe("dev-bucket");
  });

  it("on the deployed host itself, plain keys ARE that environment's store", () => {
    const store = storeForEnv("prod", env({
      APP_ENV: "production",
      ...S3,
      MEDIA_S3_BUCKET: "the-live-bucket",
    }));
    expect((store as { settings: { bucket: string } }).settings.bucket).toBe("the-live-bucket");
  });
});

describe("isLocalDatabaseUrl — the split-brain guard", () => {
  it("treats the db-reset host list, an empty value and garbage as local", () => {
    for (const url of [
      "postgres://app:app@localhost:5432/app",
      "postgres://app:app@127.0.0.1:5432/app",
      "postgres://app:app@db:5432/app",
      "postgres://app:app@postgres:5432/app",
      undefined,
      "not a url",
    ]) {
      expect(isLocalDatabaseUrl(url as string), String(url)).toBe(true);
    }
  });

  it("recognises a remote database", () => {
    expect(isLocalDatabaseUrl("postgres://u:p@db.fly-prod.example.com:5432/app")).toBe(false);
  });
});
