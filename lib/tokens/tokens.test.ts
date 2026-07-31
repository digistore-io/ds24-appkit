// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

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
  reloadIsPaused,
  RELOAD_ATTEMPT_LIMIT,
} from "./account";

describe("packages", () => {
  it("liefert ein bekanntes Paket", () => {
    // Ein Paket AUS der Registry, kein fest verdrahtetes "starter": wer nur
    // Abos verkauft, loescht die Token-Pakete aus
    // config/digistore-products.json — und ein Test, der auf den
    // Auslieferungszustand zeigt, wird dann rot, ohne dass etwas kaputt ist.
    const [pkg] = listTokenPackages();
    if (!pkg) return;
    expect(pkg.key).toBeTruthy();
    expect(pkg.credits).toBeGreaterThan(0);
    expect(getTokenPackage(pkg.key)).toEqual(pkg);
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

describe("reloadIsPaused", () => {
  // The loop this exists to close: the card is billed, the IPN never arrives,
  // the balance is never credited, so `shouldAutoReload` stays true — and the
  // 6h stale-lock timeout, written to recover a crashed process, becomes the
  // interval at which the same charge repeats. Four times a day, under
  // Digistore24's 10/day cap, so nothing outside this app ever stops it.

  it("does not pause an account that has never charged", () => {
    expect(reloadIsPaused({ reloadAttempts: 0 })).toBe(false);
  });

  it("does NOT pause after a single unconfirmed charge", () => {
    // The important negative. One charge with no credit yet is the normal
    // state of every healthy top-up while the IPN is in flight, and Digistore24
    // is allowed to be slower than the stale timeout. Pausing here would stop
    // working installations.
    expect(reloadIsPaused({ reloadAttempts: 1 })).toBe(false);
  });

  it("pauses at the limit", () => {
    expect(reloadIsPaused({ reloadAttempts: RELOAD_ATTEMPT_LIMIT })).toBe(true);
  });

  it("stays paused above the limit", () => {
    // `>=`, not `===`. An account that somehow got past the ceiling — a row
    // written before this column existed, a concurrent claim — must stay
    // stopped rather than falling through the check and charging again.
    expect(reloadIsPaused({ reloadAttempts: RELOAD_ATTEMPT_LIMIT + 5 })).toBe(
      true,
    );
  });

  it("takes the limit as a parameter, so the ceiling is not baked into callers", () => {
    expect(reloadIsPaused({ reloadAttempts: 1 }, 1)).toBe(true);
    expect(reloadIsPaused({ reloadAttempts: 4 }, 9)).toBe(false);
  });

  it("is independent of the Member's own switch", () => {
    // `shouldAutoReload` answers "does this account WANT a top-up";
    // `reloadIsPaused` answers "may we still charge for it". Keeping them
    // apart is what lets the caller report a paused account as something other
    // than a disabled one — and what keeps the pause invisible to the Member's
    // setting, which is deliberately left switched on.
    const wants = {
      balance: 0,
      autoReloadEnabled: true,
      autoReloadThreshold: 10,
    };
    expect(shouldAutoReload(wants)).toBe(true);
    expect(reloadIsPaused({ reloadAttempts: RELOAD_ATTEMPT_LIMIT })).toBe(true);
  });

  it("the shipped limit is 2 — one lost IPN tolerated, the second stops it", () => {
    // Pinned deliberately. Raising it means somebody's card is billed a third
    // time for nothing; lowering it to 1 stops healthy accounts whose IPN was
    // merely slow. Changing this number is a decision, not a tweak.
    expect(RELOAD_ATTEMPT_LIMIT).toBe(2);
  });
});
