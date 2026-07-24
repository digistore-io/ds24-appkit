import { describe, it, expect } from "vitest";
import {
  getTokenPackage,
  tokenCustomMarker,
  parseTokenCustomMarker,
  listTokenPackages,
} from "./packages";
import {
  hasSufficientBalance,
  shouldAutoReload,
  isReloadLockStale,
} from "./account";

describe("packages", () => {
  it("liefert ein bekanntes Paket", () => {
    const pkg = getTokenPackage("starter");
    expect(pkg.key).toBe("starter");
    expect(pkg.credits).toBeGreaterThan(0);
  });

  it("wirft bei unbekanntem Paket", () => {
    expect(() => getTokenPackage("gibtsnicht")).toThrow();
  });

  it("baut und parst den custom-Marker (round-trip)", () => {
    for (const pkg of listTokenPackages()) {
      const marker = tokenCustomMarker(pkg.key);
      expect(marker).toBe(`tokens:${pkg.key}`);
      expect(parseTokenCustomMarker(marker)).toBe(pkg.key);
    }
  });

  it("ignoriert fremde/leere custom-Werte", () => {
    expect(parseTokenCustomMarker(undefined)).toBeNull();
    expect(parseTokenCustomMarker("")).toBeNull();
    expect(parseTokenCustomMarker("host:123")).toBeNull();
    expect(parseTokenCustomMarker("tokens:")).toBeNull();
  });
});

describe("hasSufficientBalance", () => {
  it("erlaubt Verbrauch bis zum Guthaben", () => {
    expect(hasSufficientBalance(100, 100)).toBe(true);
    expect(hasSufficientBalance(100, 99)).toBe(true);
  });
  it("refuses consumption above the balance", () => {
    expect(hasSufficientBalance(100, 101)).toBe(false);
    expect(hasSufficientBalance(0, 1)).toBe(false);
  });
  it("lehnt negative Kosten ab", () => {
    expect(hasSufficientBalance(100, -5)).toBe(false);
  });
});

describe("shouldAutoReload", () => {
  it("triggers when enabled and balance <= threshold", () => {
    expect(
      shouldAutoReload({
        balance: 10,
        autoReloadEnabled: true,
        autoReloadThreshold: 10,
      }),
    ).toBe(true);
    expect(
      shouldAutoReload({
        balance: 5,
        autoReloadEnabled: true,
        autoReloadThreshold: 10,
      }),
    ).toBe(true);
  });
  it("does not trigger above the threshold or when disabled", () => {
    expect(
      shouldAutoReload({
        balance: 11,
        autoReloadEnabled: true,
        autoReloadThreshold: 10,
      }),
    ).toBe(false);
    expect(
      shouldAutoReload({
        balance: 0,
        autoReloadEnabled: false,
        autoReloadThreshold: 10,
      }),
    ).toBe(false);
  });
});

describe("isReloadLockStale", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  it("behandelt fehlenden Lock als frei", () => {
    expect(isReloadLockStale(null, now)).toBe(true);
  });
  it("frischer Lock ist nicht stale", () => {
    const recent = new Date(now.getTime() - 60_000); // 1 min alt
    expect(isReloadLockStale(recent, now)).toBe(false);
  });
  it("a lock older than the timeout is stale", () => {
    const old = new Date(now.getTime() - 7 * 3_600_000); // 7h alt (Timeout 6h)
    expect(isReloadLockStale(old, now)).toBe(true);
  });
});
