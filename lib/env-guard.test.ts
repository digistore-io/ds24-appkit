// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { appEnv, isRealEnvironment, checkEnvironment } from "./env-guard";

describe("appEnv", () => {
  it("recognizes development (including empty/unknown-local)", () => {
    for (const v of ["development", "dev", "local", "", undefined, "  DEV  "]) {
      expect(appEnv(v)).toBe("development");
    }
  });

  it("recognizes staging", () => {
    expect(appEnv("staging")).toBe("staging");
    expect(appEnv("test")).toBe("staging");
  });

  it("classifies anything unknown as production (strict when in doubt)", () => {
    for (const v of ["production", "prod", "developmnt", "live", "whatever"]) {
      expect(appEnv(v)).toBe("production");
    }
  });
});

describe("isRealEnvironment", () => {
  it("separates DEV from STAGING/PROD", () => {
    expect(isRealEnvironment("development")).toBe(false);
    expect(isRealEnvironment("staging")).toBe(true);
    expect(isRealEnvironment("production")).toBe(true);
  });
});

describe("checkEnvironment", () => {
  // "Everything a real environment needs". It grows whenever a new start
  // condition is added, which is the point: a test named "is satisfied when
  // everything is set" has to keep meaning that.
  const complete = {
    APP_ENV: "production",
    AUTH_SECRET: "secret",
    emailConfigured: true,
    MEDIA_DRIVER: "s3",
    mediaBucketConfigured: true,
  };

  it("lets DEV through without mail delivery", () => {
    expect(
      checkEnvironment({ APP_ENV: "development", emailConfigured: false }),
    ).toEqual([]);
  });

  it("requires mail delivery in PROD", () => {
    const p = checkEnvironment({ ...complete, emailConfigured: false });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/email delivery/);
  });

  it("requires mail delivery in STAGING too", () => {
    const p = checkEnvironment({
      ...complete,
      APP_ENV: "staging",
      emailConfigured: false,
    });
    expect(p[0]).toMatch(/email delivery/);
  });

  it("requires AUTH_SECRET in real environments", () => {
    const p = checkEnvironment({ ...complete, AUTH_SECRET: undefined });
    expect(p.some((m) => /AUTH_SECRET/.test(m))).toBe(true);
  });

  it("reports several problems at once", () => {
    // Named rather than counted: somebody deploying a half-configured app
    // should see everything that is wrong in one go, not fix one thing and
    // meet the next on the following attempt.
    const problems = checkEnvironment({
      APP_ENV: "production",
      AUTH_SECRET: undefined,
      emailConfigured: false,
    });
    expect(problems.some((m) => /email delivery/.test(m))).toBe(true);
    expect(problems.some((m) => /AUTH_SECRET/.test(m))).toBe(true);
    expect(problems.some((m) => /MEDIA_DRIVER/.test(m))).toBe(true);
    expect(problems).toHaveLength(3);
  });

  it("is satisfied when everything is set", () => {
    expect(checkEnvironment(complete)).toEqual([]);
  });
});

describe("media storage in a real environment", () => {
  const base = { AUTH_SECRET: "s", emailConfigured: true };

  it("lets development do whatever it likes", () => {
    // A fresh clone has no bucket and must still start.
    expect(checkEnvironment({ ...base, APP_ENV: "development" })).toEqual([]);
    expect(
      checkEnvironment({ ...base, APP_ENV: "development", MEDIA_DRIVER: "local" }),
    ).toEqual([]);
  });

  for (const environment of ["staging", "production"]) {
    it(`refuses to start ${environment} on the local disk`, () => {
      // The decision a later reader is most likely to soften, because on ONE
      // node the local disk works perfectly. The failure it prevents appears
      // only after the app is successful: the next redeploy loses every file,
      // and a second instance cannot see what the first one wrote.
      const problems = checkEnvironment({
        ...base,
        APP_ENV: environment,
        MEDIA_DRIVER: "local",
        mediaBucketConfigured: false,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("MEDIA_DRIVER");
      expect(problems[0]).toContain("redeploy");
    });

    it(`refuses ${environment} with MEDIA_DRIVER unset at all`, () => {
      // Unset must not be a quieter way of saying "local".
      const problems = checkEnvironment({ ...base, APP_ENV: environment });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("MEDIA_DRIVER");
    });

    it(`refuses ${environment} when s3 is chosen but not configured`, () => {
      // Not "media off" — an app that accepts an upload and fails at the moment
      // it tries to store it, after the customer has waited for the file to
      // travel.
      const problems = checkEnvironment({
        ...base,
        APP_ENV: environment,
        MEDIA_DRIVER: "s3",
        mediaBucketConfigured: false,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("MEDIA_S3_ENDPOINT");
    });

    it(`starts ${environment} with a configured bucket`, () => {
      expect(
        checkEnvironment({
          ...base,
          APP_ENV: environment,
          MEDIA_DRIVER: "s3",
          mediaBucketConfigured: true,
        }),
      ).toEqual([]);
    });

    // ── The exemption, which had no test at all ───────────────────────────
    // It is the one change in this area that LOOSENS a rule `CLAUDE.md` states
    // as absolute ("In STAGING and PROD `MEDIA_DRIVER=local` stops the app from
    // starting"), and an untested exemption to a hard rule is how the rule
    // quietly stops existing. Both directions are asserted here so that
    // widening it takes a deliberate edit to a test that says why.
    it(`starts ${environment} with media switched OFF and no bucket`, () => {
      // An app that accepts no media needs nowhere to put it. Without this,
      // every app generated from 0.7.0 had to book object storage before it
      // could deploy — including the ones that will never take a file.
      expect(
        checkEnvironment({
          ...base,
          APP_ENV: environment,
          MEDIA_DRIVER: "local",
          mediaBucketConfigured: false,
          mediaEnabled: false,
        }),
      ).toEqual([]);
    });

    it(`still refuses ${environment} on the local disk when media is ON`, () => {
      // The exemption reaches exactly as far as `"enabled": false`. An app that
      // uses media gets the original refusal, and `mediaEnabled: undefined` —
      // an older caller that does not pass the field — must behave as ON.
      for (const mediaEnabled of [true, undefined]) {
        const problems = checkEnvironment({
          ...base,
          APP_ENV: environment,
          MEDIA_DRIVER: "local",
          mediaBucketConfigured: false,
          mediaEnabled,
        });
        expect(problems, `mediaEnabled: ${String(mediaEnabled)}`).toHaveLength(1);
        expect(problems[0]).toContain("MEDIA_DRIVER");
      }
    });

    it(`refuses ${environment} on a driver that does not exist`, () => {
      const problems = checkEnvironment({
        ...base,
        APP_ENV: environment,
        MEDIA_DRIVER: "ftp",
        mediaBucketConfigured: true,
      });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("not a driver");
    });
  }
});
