// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  devCookies,
  installationFingerprint,
  shouldUseOwnCookieNames,
} from "./cookie-names";

const DEV = {
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "geheim",
};

describe("installationFingerprint", () => {
  it("is stable for the same secret", () => {
    expect(installationFingerprint("abc")).toBe(installationFingerprint("abc"));
  });

  it("unterscheidet verschiedene Secrets", () => {
    expect(installationFingerprint("abc")).not.toBe(installationFingerprint("abd"));
  });

  it("ist immer 8 Hex-Zeichen — auch ohne Secret", () => {
    for (const s of [undefined, "", "x", "a".repeat(64)]) {
      expect(installationFingerprint(s)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("gibt das Secret nicht preis", () => {
    const secret = "d8e5ee724d6e168d53bbdd045cbadac6";
    expect(secret).not.toContain(installationFingerprint(secret));
  });
});

describe("shouldUseOwnCookieNames", () => {
  it("gilt in DEV auf localhost", () => {
    expect(shouldUseOwnCookieNames(DEV)).toBe(true);
    expect(shouldUseOwnCookieNames({ ...DEV, APP_URL: "http://127.0.0.1:3001" })).toBe(true);
  });

  it("gilt NICHT in STAGING oder PROD", () => {
    for (const env of ["staging", "production", "PROD", "tippfehler"]) {
      expect(shouldUseOwnCookieNames({ ...DEV, APP_ENV: env })).toBe(false);
    }
  });

  it("gilt NICHT bei einer echten Domain, auch wenn APP_ENV development sagt", () => {
    expect(shouldUseOwnCookieNames({ ...DEV, APP_URL: "https://app.example.de" })).toBe(false);
  });

  it("gilt nicht ohne AUTH_SECRET", () => {
    expect(shouldUseOwnCookieNames({ ...DEV, AUTH_SECRET: undefined })).toBe(false);
  });
});

describe("devCookies", () => {
  it("returns undefined outside DEV — Auth.js keeps its defaults", () => {
    expect(devCookies({ ...DEV, APP_ENV: "production" })).toBeUndefined();
  });

  it("appends the fingerprint to all three cookie names", () => {
    const c = devCookies(DEV)!;
    const fingerprint = installationFingerprint(DEV.AUTH_SECRET);
    expect(c.sessionToken.name).toBe(`authjs.session-token.${fingerprint}`);
    expect(c.callbackUrl.name).toBe(`authjs.callback-url.${fingerprint}`);
    expect(c.csrfToken.name).toBe(`authjs.csrf-token.${fingerprint}`);
  });

  it("hands out different names for two installations", () => {
    const a = devCookies({ ...DEV, AUTH_SECRET: "eins" })!;
    const b = devCookies({ ...DEV, AUTH_SECRET: "zwei" })!;
    expect(a.sessionToken.name).not.toBe(b.sessionToken.name);
  });

  it("sets httpOnly and leaves secure off locally (http://localhost)", () => {
    const c = devCookies(DEV)!;
    for (const cookie of [c.sessionToken, c.callbackUrl, c.csrfToken]) {
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.secure).toBe(false);
      expect(cookie.options.sameSite).toBe("lax");
      expect(cookie.options.path).toBe("/");
    }
  });
});
