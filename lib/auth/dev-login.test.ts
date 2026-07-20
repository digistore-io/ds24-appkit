import { describe, it, expect } from "vitest";
import { istDevLoginErlaubt, istLokal, type DevLoginEnv } from "./dev-login";

// Der Entwicklungs-Login ist ein Auth-Bypass. Diese Tests sind die Wache davor:
// Jede einzelne Bedingung muss ihn allein abschalten können.
const erlaubt: DevLoginEnv = {
  NODE_ENV: "development",
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  emailKonfiguriert: false,
};

describe("istDevLoginErlaubt", () => {
  it("erlaubt ihn nur im lokalen Entwicklungsfall ohne Mailversand", () => {
    expect(istDevLoginErlaubt(erlaubt)).toBe(true);
  });

  it("sperrt bei NODE_ENV=production", () => {
    expect(istDevLoginErlaubt({ ...erlaubt, NODE_ENV: "production" })).toBe(false);
  });

  it("sperrt bei APP_ENV=production", () => {
    expect(istDevLoginErlaubt({ ...erlaubt, APP_ENV: "production" })).toBe(false);
  });

  it("sperrt bei APP_ENV=staging", () => {
    expect(istDevLoginErlaubt({ ...erlaubt, APP_ENV: "staging" })).toBe(false);
  });

  it("sperrt bei unbekanntem oder vertipptem APP_ENV (Allowlist)", () => {
    // appEnv() stuft alles Unbekannte als "production" ein — ein Tippfehler
    // darf den Bypass niemals öffnen.
    for (const wert of ["prod", "produktion", "developmnt", "DEV ", "live", "x"]) {
      const ergebnis = istDevLoginErlaubt({ ...erlaubt, APP_ENV: wert });
      // "DEV " (mit Leerzeichen) wird normalisiert und ist erlaubt.
      expect(ergebnis).toBe(wert.trim().toLowerCase() === "dev");
    }
  });

  it("sperrt, sobald ein Mailversand konfiguriert ist", () => {
    expect(istDevLoginErlaubt({ ...erlaubt, emailKonfiguriert: true })).toBe(false);
  });

  it("sperrt bei nicht-lokaler APP_URL", () => {
    for (const url of [
      "https://meine-app.de",
      "http://192.168.1.10:3000",
      "https://staging.meine-app.de",
    ]) {
      expect(istDevLoginErlaubt({ ...erlaubt, APP_URL: url })).toBe(false);
    }
  });

  it("lässt sich mit DEV_LOGIN=off hart abschalten", () => {
    expect(istDevLoginErlaubt({ ...erlaubt, DEV_LOGIN: "off" })).toBe(false);
  });

  it("bleibt gesperrt, wenn mehrere Bedingungen zugleich verletzt sind", () => {
    expect(
      istDevLoginErlaubt({
        ...erlaubt,
        NODE_ENV: "production",
        APP_URL: "https://meine-app.de",
        emailKonfiguriert: true,
      }),
    ).toBe(false);
  });
});

describe("istLokal", () => {
  it("erkennt lokale Adressen", () => {
    expect(istLokal("http://localhost:3000")).toBe(true);
    expect(istLokal("http://127.0.0.1:3001")).toBe(true);
    expect(istLokal(undefined)).toBe(true); // nicht gesetzt = lokal
  });

  it("erkennt fremde Adressen", () => {
    expect(istLokal("https://meine-app.de")).toBe(false);
    expect(istLokal("http://app.internal:3000")).toBe(false);
  });

  it("sperrt bei unparsebarer URL", () => {
    expect(istLokal("kaputt")).toBe(false);
  });
});
