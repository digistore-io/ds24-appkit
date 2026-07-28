// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  devCookies,
  installationFingerprint,
  shouldUseOwnCookieNames,
  staleAuthCookieNames,
  PRUNE_ABOVE_BYTES,
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

  it("gives the DEV cookies a maxAge of at most a week", () => {
    const c = devCookies(DEV)!;
    for (const cookie of [c.sessionToken, c.callbackUrl, c.csrfToken]) {
      expect(cookie.options.maxAge).toBeGreaterThan(0);
      expect(cookie.options.maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    }
  });
});

/**
 * A cookie of a FOREIGN installation, sized like a real Auth.js session JWE.
 * `index` only has to vary the fingerprint — it stands for another copy of this
 * template, not for an order.
 */
function foreign(index: number, kind = "session-token") {
  return {
    name: `authjs.${kind}.${(0x10000000 + index).toString(16)}`,
    value: "e".repeat(499),
  };
}

/** As many foreign installations as it takes to pass the threshold. */
function overThreshold() {
  const jar = [];
  while (jar.reduce((n, c) => n + c.name.length + c.value.length + 2, 0) <= PRUNE_ABOVE_BYTES) {
    jar.push(foreign(jar.length));
  }
  return jar;
}

describe("staleAuthCookieNames", () => {
  it("prunes nothing while the jar is small — two apps side by side stay signed in", () => {
    const own = devCookies(DEV)!;
    const jar = [
      { name: own.sessionToken.name, value: "x".repeat(499) },
      foreign(1),
      foreign(2),
    ];
    expect(staleAuthCookieNames(jar, DEV)).toEqual([]);
  });

  it("names the foreign fingerprints once the jar passes the threshold", () => {
    const jar = overThreshold();
    const stale = staleAuthCookieNames(jar, DEV);
    expect(stale.length).toBe(jar.length);
    expect(stale).toEqual(expect.arrayContaining(jar.map((c) => c.name)));
  });

  it("never names its own three cookies, however full the jar is", () => {
    const own = devCookies(DEV)!;
    const mine = [own.sessionToken.name, own.callbackUrl.name, own.csrfToken.name];
    const jar = [...overThreshold(), ...mine.map((name) => ({ name, value: "x".repeat(499) }))];
    const stale = staleAuthCookieNames(jar, DEV);
    for (const name of mine) expect(stale).not.toContain(name);
  });

  it("prunes a foreign installation's CHUNKED session cookie — the largest kind", () => {
    // Auth.js splits a session JWE over ~4 KB into `<name>.0`, `<name>.1`, …
    // (SessionStore in @auth/core). These are the biggest cookies a copy can
    // leave behind — a rule that spared them would fire and remove nothing.
    const chunks = [
      { name: "authjs.session-token.deadbeef.0", value: "e".repeat(3900) },
      { name: "authjs.session-token.deadbeef.1", value: "e".repeat(3900) },
      { name: "authjs.session-token.deadbeef.10", value: "e".repeat(700) },
    ];
    const stale = staleAuthCookieNames([...overThreshold(), ...chunks], DEV);
    for (const chunk of chunks) expect(stale).toContain(chunk.name);
  });

  it("spares its own chunks — even when the fingerprint is all digits", () => {
    // Stripping the chunk index must never strip the fingerprint. About one in
    // forty secrets hashes to eight DIGITS, and on such an unchunked name the
    // naive strip would remove the identity — search one deterministically.
    let secret = 0;
    while (!/^\d{8}$/.test(installationFingerprint(String(secret)))) secret++;
    const env = { ...DEV, AUTH_SECRET: String(secret) };
    const own = devCookies(env)!;
    const mine = [
      own.sessionToken.name,
      `${own.sessionToken.name}.0`,
      `${own.sessionToken.name}.1`,
    ];
    const jar = [...overThreshold(), ...mine.map((name) => ({ name, value: "x".repeat(3900) }))];
    const stale = staleAuthCookieNames(jar, env);
    for (const name of mine) expect(stale).not.toContain(name);
  });

  it("leaves everything that is not this template's naming scheme alone", () => {
    const strangers = [
      { name: "authjs.session-token", value: "x".repeat(499) },
      { name: "next-auth.session-token", value: "x".repeat(499) },
      { name: "authjs.session-token.NOTHEX", value: "x".repeat(499) },
      { name: "authjs.session-token.abc", value: "x".repeat(499) },
      { name: "grafana_session", value: "x".repeat(499) },
    ];
    const stale = staleAuthCookieNames([...overThreshold(), ...strangers], DEV);
    for (const stranger of strangers) expect(stale).not.toContain(stranger.name);
  });

  it("prunes nothing outside DEV, on a real domain, or without a secret", () => {
    const jar = overThreshold();
    expect(staleAuthCookieNames(jar, { ...DEV, APP_ENV: "production" })).toEqual([]);
    expect(staleAuthCookieNames(jar, { ...DEV, APP_ENV: "tippfehler" })).toEqual([]);
    expect(staleAuthCookieNames(jar, { ...DEV, APP_URL: "https://app.example.de" })).toEqual([]);
    expect(staleAuthCookieNames(jar, { ...DEV, AUTH_SECRET: undefined })).toEqual([]);
  });

  it("counts every authjs cookie towards the threshold, its own included", () => {
    // One foreign installation next to a jar that is already large because of
    // OUR cookies: the header is what breaks, no matter whose name is on it.
    const own = devCookies(DEV)!;
    const jar = [
      { name: own.sessionToken.name, value: "x".repeat(PRUNE_ABOVE_BYTES) },
      foreign(1),
    ];
    expect(staleAuthCookieNames(jar, DEV)).toEqual([foreign(1).name]);
  });
});
