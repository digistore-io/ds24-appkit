import { describe, it, expect } from "vitest";
import { appEnv, istEchteUmgebung, pruefeUmgebung } from "./env-guard";

describe("appEnv", () => {
  it("erkennt Entwicklung (inkl. leer/unbekannt-lokal)", () => {
    for (const v of ["development", "dev", "local", "", undefined, "  DEV  "]) {
      expect(appEnv(v)).toBe("development");
    }
  });

  it("erkennt Staging", () => {
    expect(appEnv("staging")).toBe("staging");
    expect(appEnv("test")).toBe("staging");
  });

  it("stuft alles Unbekannte als Produktion ein (im Zweifel streng)", () => {
    for (const v of ["production", "prod", "developmnt", "live", "irgendwas"]) {
      expect(appEnv(v)).toBe("production");
    }
  });
});

describe("istEchteUmgebung", () => {
  it("trennt DEV von STAGING/PROD", () => {
    expect(istEchteUmgebung("development")).toBe(false);
    expect(istEchteUmgebung("staging")).toBe(true);
    expect(istEchteUmgebung("production")).toBe(true);
  });
});

describe("pruefeUmgebung", () => {
  const vollstaendig = {
    APP_ENV: "production",
    AUTH_SECRET: "geheim",
    emailKonfiguriert: true,
  };

  it("lässt DEV ohne Mailversand durch", () => {
    expect(
      pruefeUmgebung({ APP_ENV: "development", emailKonfiguriert: false }),
    ).toEqual([]);
  });

  it("verlangt Mailversand in PROD", () => {
    const p = pruefeUmgebung({ ...vollstaendig, emailKonfiguriert: false });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/E-Mail-Versand/);
  });

  it("verlangt Mailversand auch in STAGING", () => {
    const p = pruefeUmgebung({
      ...vollstaendig,
      APP_ENV: "staging",
      emailKonfiguriert: false,
    });
    expect(p[0]).toMatch(/E-Mail-Versand/);
  });

  it("verlangt AUTH_SECRET in echten Umgebungen", () => {
    const p = pruefeUmgebung({ ...vollstaendig, AUTH_SECRET: undefined });
    expect(p.some((m) => /AUTH_SECRET/.test(m))).toBe(true);
  });

  it("meldet mehrere Probleme zugleich", () => {
    expect(
      pruefeUmgebung({
        APP_ENV: "production",
        AUTH_SECRET: undefined,
        emailKonfiguriert: false,
      }),
    ).toHaveLength(2);
  });

  it("ist zufrieden, wenn alles gesetzt ist", () => {
    expect(pruefeUmgebung(vollstaendig)).toEqual([]);
  });
});
