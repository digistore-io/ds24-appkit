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
  const complete = {
    APP_ENV: "production",
    AUTH_SECRET: "secret",
    emailConfigured: true,
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
    expect(
      checkEnvironment({
        APP_ENV: "production",
        AUTH_SECRET: undefined,
        emailConfigured: false,
      }),
    ).toHaveLength(2);
  });

  it("is satisfied when everything is set", () => {
    expect(checkEnvironment(complete)).toEqual([]);
  });
});
