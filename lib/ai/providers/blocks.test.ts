// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  CHARS_PER_TOKEN_ESTIMATE,
  assertCacheableOrder,
  estimatedCacheablePrefixTokens,
  flattenBlocks,
  isCacheableOrderValid,
  lastCacheableIndex,
} from "./blocks";
import { ProviderError } from "./types";

describe("isCacheableOrderValid", () => {
  it("accepts the shape the whole abstraction is built around", () => {
    expect(
      isCacheableOrderValid([
        { text: "persona", cacheable: true },
        { text: "handbook", cacheable: true },
        { text: "today is 2026-07-25" },
      ]),
    ).toBe(true);
  });

  it("accepts a prompt with nothing cacheable", () => {
    expect(isCacheableOrderValid([{ text: "a" }, { text: "b" }])).toBe(true);
    expect(isCacheableOrderValid([])).toBe(true);
  });

  it("accepts a prompt that is cacheable all the way through", () => {
    expect(
      isCacheableOrderValid([
        { text: "a", cacheable: true },
        { text: "b", cacheable: true },
      ]),
    ).toBe(true);
  });

  it("REJECTS a cacheable block after a varying one", () => {
    // The failure this whole file exists for. Nothing errors at the provider,
    // nothing goes red in a test suite, the answer is identical — and the input
    // bill is several times what it should be.
    expect(
      isCacheableOrderValid([
        { text: "today is 2026-07-25" },
        { text: "handbook", cacheable: true },
      ]),
    ).toBe(false);
  });

  it("rejects a cacheable block sandwiched between varying ones", () => {
    expect(
      isCacheableOrderValid([
        { text: "persona", cacheable: true },
        { text: "date" },
        { text: "handbook", cacheable: true },
      ]),
    ).toBe(false);
  });
});

describe("assertCacheableOrder", () => {
  it("throws a typed error rather than warning", () => {
    expect(() => assertCacheableOrder([{ text: "x" }, { text: "y", cacheable: true }]))
      .toThrow(ProviderError);
  });

  it("says where to look", () => {
    try {
      assertCacheableOrder([{ text: "x" }, { text: "y", cacheable: true }]);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("lib/ai/prompt.ts");
    }
  });

  it("passes a valid order silently", () => {
    expect(() => assertCacheableOrder([{ text: "a", cacheable: true }, { text: "b" }]))
      .not.toThrow();
  });
});

describe("lastCacheableIndex", () => {
  it("finds the breakpoint", () => {
    expect(
      lastCacheableIndex([
        { text: "a", cacheable: true },
        { text: "b", cacheable: true },
        { text: "c" },
      ]),
    ).toBe(1);
  });

  it("is -1 when nothing is cacheable", () => {
    expect(lastCacheableIndex([{ text: "a" }])).toBe(-1);
    expect(lastCacheableIndex([])).toBe(-1);
  });
});

describe("flattenBlocks", () => {
  it("keeps the order, because the order IS the caching mechanism", () => {
    expect(
      flattenBlocks([
        { text: "stable", cacheable: true },
        { text: "varies" },
      ]),
    ).toBe("stable\n\nvaries");
  });

  it("drops empty blocks without disturbing the separator", () => {
    expect(flattenBlocks([{ text: "a" }, { text: "" }, { text: "b" }])).toBe("a\n\nb");
  });

  it("produces a byte-identical prefix across requests that differ only at the end", () => {
    // The property three providers' automatic prefix caching depends on.
    const stable = [
      { text: "persona", cacheable: true },
      { text: "handbook", cacheable: true },
    ];
    const first = flattenBlocks([...stable, { text: "2026-07-25" }]);
    const second = flattenBlocks([...stable, { text: "2026-07-26" }]);

    const shared = flattenBlocks(stable);
    expect(first.startsWith(shared)).toBe(true);
    expect(second.startsWith(shared)).toBe(true);
  });

  it("is empty for an empty prompt", () => {
    expect(flattenBlocks([])).toBe("");
  });
});

describe("estimatedCacheablePrefixTokens", () => {
  it("measures only up to the last cacheable block", () => {
    const tokens = estimatedCacheablePrefixTokens([
      { text: "x".repeat(400), cacheable: true },
      { text: "y".repeat(4000) },
    ]);
    expect(tokens).toBe(400 / CHARS_PER_TOKEN_ESTIMATE);
  });

  it("is zero when nothing is cacheable", () => {
    expect(estimatedCacheablePrefixTokens([{ text: "x".repeat(10_000) }])).toBe(0);
  });
});
