import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ds24ApiKey, ds24IpnPassphrase } from "./settings";

// Die Zugangsdaten kommen aus der Umgebung (Ein-Betreiber-Modell). Die beiden
// Funktionen sind die einzige Stelle, an der die App sie liest — entsprechend
// wichtig ist, dass sie bei fehlender Konfiguration NICHT stillschweigend etwas
// Brauchbares zurückgeben.
const urspruenglich = { ...process.env };

beforeEach(() => {
  delete process.env.DIGISTORE_API_KEY;
  delete process.env.DIGISTORE_IPN_PASSPHRASE;
});

afterEach(() => {
  process.env = { ...urspruenglich };
});

describe("ds24ApiKey", () => {
  it("gibt den gesetzten Key zurück", () => {
    process.env.DIGISTORE_API_KEY = "1234-abcd";
    expect(ds24ApiKey()).toBe("1234-abcd");
  });

  it("wirft, wenn der Key fehlt — kein stiller Fallback", () => {
    expect(() => ds24ApiKey()).toThrow(/DIGISTORE_API_KEY/);
  });

  it("nennt in der Fehlermeldung den Weg zur Behebung", () => {
    expect(() => ds24ApiKey()).toThrow(/make ds24-connect/);
  });

  it("behandelt den leeren String wie ein fehlendes Secret", () => {
    process.env.DIGISTORE_API_KEY = "";
    expect(() => ds24ApiKey()).toThrow();
  });
});

describe("ds24IpnPassphrase", () => {
  it("gibt die gesetzte Passphrase zurück", () => {
    process.env.DIGISTORE_IPN_PASSPHRASE = "geheim";
    expect(ds24IpnPassphrase()).toBe("geheim");
  });

  // null statt Wurf: Der IPN-Endpoint soll mit 403 antworten, nicht mit 500 —
  // ein unkonfigurierter Webhook ist kein Serverfehler.
  it("gibt null zurück, wenn nichts gesetzt ist", () => {
    expect(ds24IpnPassphrase()).toBeNull();
  });

  it("gibt bei leerem String null zurück, nicht den leeren String", () => {
    process.env.DIGISTORE_IPN_PASSPHRASE = "";
    expect(ds24IpnPassphrase()).toBeNull();
  });
});
