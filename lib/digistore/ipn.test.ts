import { describe, it, expect } from "vitest";
import {
  digistoreShaSign,
  verifyIpnSignature,
  mapEventToStatus,
  mapEventToSubscriptionStatus,
} from "./ipn";

const PASSPHRASE = "s3cret-passphrase";

describe("digistoreShaSign", () => {
  it("erzeugt einen uppercase SHA512-Hex-String (128 Zeichen)", () => {
    const sig = digistoreShaSign(
      { order_id: "ABC", product_id: "123" },
      PASSPHRASE,
    );
    expect(sig).toMatch(/^[0-9A-F]{128}$/);
  });

  it("is independent of field order (keys are sorted)", () => {
    const a = digistoreShaSign(
      { order_id: "ABC", product_id: "123", amount: "47.00" },
      PASSPHRASE,
    );
    const b = digistoreShaSign(
      { amount: "47.00", product_id: "123", order_id: "ABC" },
      PASSPHRASE,
    );
    expect(a).toBe(b);
  });

  it("ignoriert leere Werte", () => {
    const withEmpty = digistoreShaSign(
      { order_id: "ABC", note: "" },
      PASSPHRASE,
    );
    const without = digistoreShaSign({ order_id: "ABC" }, PASSPHRASE);
    expect(withEmpty).toBe(without);
  });

  it("excludes sha_sign/SHASIGN from the computation", () => {
    const base = digistoreShaSign({ order_id: "ABC" }, PASSPHRASE);
    const withSig = digistoreShaSign(
      { order_id: "ABC", sha_sign: "DEADBEEF", SHASIGN: "x" },
      PASSPHRASE,
    );
    expect(withSig).toBe(base);
  });

  it("changes with a different passphrase", () => {
    const a = digistoreShaSign({ order_id: "ABC" }, PASSPHRASE);
    const b = digistoreShaSign({ order_id: "ABC" }, "andere");
    expect(a).not.toBe(b);
  });
});

describe("verifyIpnSignature", () => {
  it("akzeptiert eine korrekt signierte Payload", () => {
    const payload: Record<string, string> = {
      event: "on_payment",
      order_id: "ORD-1",
      product_id: "42",
      amount: "47.00",
    };
    payload.sha_sign = digistoreShaSign(payload, PASSPHRASE);
    expect(verifyIpnSignature(payload, PASSPHRASE)).toBe(true);
  });

  it("akzeptiert auch klein geschriebenes sha_sign (case-insensitiv)", () => {
    const payload: Record<string, string> = { order_id: "ORD-1" };
    payload.sha_sign = digistoreShaSign(payload, PASSPHRASE).toLowerCase();
    expect(verifyIpnSignature(payload, PASSPHRASE)).toBe(true);
  });

  // Regression: Digistore24 signs with the ORIGINAL field-name case
  // (order_id=…). Signing with uppercased keys (ORDER_ID=…) — as the code once
  // did unconditionally — made every real IPN read "Signatur ungültig".
  it("akzeptiert die Original-Schreibweise der Keys (DS24-Standard)", () => {
    const payload: Record<string, string> = {
      event: "on_payment",
      order_id: "ORD-1",
      buyer_email: "kunde@example.de",
    };
    payload.sha_sign = digistoreShaSign(payload, PASSPHRASE, "sha512", false);
    expect(verifyIpnSignature(payload, PASSPHRASE)).toBe(true);
  });

  it("akzeptiert auch groß geschriebene Keys (convert_keys_to_uppercase)", () => {
    const payload: Record<string, string> = {
      event: "on_payment",
      order_id: "ORD-1",
      buyer_email: "kunde@example.de",
    };
    payload.sha_sign = digistoreShaSign(payload, PASSPHRASE, "sha512", true);
    expect(verifyIpnSignature(payload, PASSPHRASE)).toBe(true);
  });

  it("die beiden Key-Schreibweisen ergeben unterschiedliche Signaturen", () => {
    // Otherwise the dual acceptance above would be meaningless.
    const p: Record<string, string> = { order_id: "abc", buyer_email: "x@y.de" };
    expect(digistoreShaSign(p, PASSPHRASE, "sha512", false)).not.toBe(
      digistoreShaSign(p, PASSPHRASE, "sha512", true),
    );
  });

  it("lehnt manipulierte Payloads ab", () => {
    const payload: Record<string, string> = {
      order_id: "ORD-1",
      amount: "47.00",
    };
    payload.sha_sign = digistoreShaSign(payload, PASSPHRASE);
    payload.amount = "1.00"; // tampered with after signing
    expect(verifyIpnSignature(payload, PASSPHRASE)).toBe(false);
  });

  it("lehnt fehlende Signatur oder fehlende Passphrase ab (fail-closed)", () => {
    expect(verifyIpnSignature({ order_id: "X" }, PASSPHRASE)).toBe(false);
    expect(
      verifyIpnSignature({ order_id: "X", sha_sign: "abc" }, ""),
    ).toBe(false);
  });
});

describe("mapEventToStatus", () => {
  it("bildet Zahlungs-Events auf 'paid' ab", () => {
    expect(mapEventToStatus("on_payment")).toBe("paid");
    expect(mapEventToStatus("on_payment_subscription_signup")).toBe("paid");
  });
  it("bildet Refund/Chargeback/Missed/Cancel korrekt ab", () => {
    expect(mapEventToStatus("on_refund")).toBe("refunded");
    expect(mapEventToStatus("on_chargeback")).toBe("chargeback");
    expect(mapEventToStatus("on_payment_missed")).toBe("paused");
    expect(mapEventToStatus("last_paid_day")).toBe("cancelled");
  });
  it("returns null for events that carry no status change", () => {
    expect(mapEventToStatus("connection_test")).toBeNull();
    expect(mapEventToStatus("unknown_event")).toBeNull();
  });
});

describe("mapEventToSubscriptionStatus", () => {
  it("bildet Zahlungs-/Resume-Events auf 'active' ab", () => {
    expect(mapEventToSubscriptionStatus("on_payment")).toBe("active");
    expect(mapEventToSubscriptionStatus("on_payment_subscription_signup")).toBe(
      "active",
    );
    expect(mapEventToSubscriptionStatus("on_rebill_resumed")).toBe("active");
  });
  it("maps a missed payment to 'paused' and a cancellation to 'cancelled'", () => {
    expect(mapEventToSubscriptionStatus("on_payment_missed")).toBe("paused");
    expect(mapEventToSubscriptionStatus("on_rebill_cancelled")).toBe("cancelled");
    expect(mapEventToSubscriptionStatus("last_paid_day")).toBe("cancelled");
  });
  it("returns null for subscription-neutral events", () => {
    expect(mapEventToSubscriptionStatus("on_refund")).toBeNull();
    expect(mapEventToSubscriptionStatus("connection_test")).toBeNull();
  });
});
