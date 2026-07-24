import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ds24ApiKey, ds24IpnPassphrase } from "./settings";

// Die Zugangsdaten kommen aus der Umgebung (Ein-Betreiber-Modell). Die beiden
// Funktionen sind die einzige Stelle, an der die App sie liest — entsprechend
// wichtig ist, dass sie bei fehlender Konfiguration NICHT stillschweigend etwas
// return something usable.
const urspruenglich = { ...process.env };

beforeEach(() => {
  delete process.env.DIGISTORE_API_KEY;
  delete process.env.DIGISTORE_IPN_PASSPHRASE;
});

afterEach(() => {
  process.env = { ...urspruenglich };
});

describe("ds24ApiKey", () => {
  it("returns the configured key", () => {
    process.env.DIGISTORE_API_KEY = "1234-abcd";
    expect(ds24ApiKey()).toBe("1234-abcd");
  });

  it("wirft, wenn der Key fehlt — kein stiller Fallback", () => {
    expect(() => ds24ApiKey()).toThrow(/DIGISTORE_API_KEY/);
  });

  it("nennt in der Fehlermeldung den Weg zur Behebung", () => {
    expect(() => ds24ApiKey()).toThrow(/node run.mjs ds24-connect/);
  });

  it("behandelt den leeren String wie ein fehlendes Secret", () => {
    process.env.DIGISTORE_API_KEY = "";
    expect(() => ds24ApiKey()).toThrow();
  });
});

describe("ds24IpnPassphrase", () => {
  it("returns the configured passphrase", () => {
    process.env.DIGISTORE_IPN_PASSPHRASE = "geheim";
    expect(ds24IpnPassphrase()).toBe("geheim");
  });

  // null statt Wurf: Der IPN-Endpoint soll mit 403 antworten, nicht mit 500 —
  // ein unkonfigurierter Webhook ist kein Serverfehler.
  it("returns null when nothing is set", () => {
    expect(ds24IpnPassphrase()).toBeNull();
  });

  it("returns null for an empty string, not the empty string", () => {
    process.env.DIGISTORE_IPN_PASSPHRASE = "";
    expect(ds24IpnPassphrase()).toBeNull();
  });
});
