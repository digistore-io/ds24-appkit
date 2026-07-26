// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CURRENCY,
  costMicros,
  estimateMicros,
  formatMicros,
  priceFor,
  priceKey,
  recommendedCurrency,
} from "./pricing.mjs";
import prices from "@/config/ai-prices.json";
import { pricesUpdatedAt } from "./prices";
import { allBindings } from "./tasks";

const TABLE = {
  defaultCurrency: "USD",
  models: {
    "anthropic/m": { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
    "mistral/small": { input: 0.1, output: 0.3, currency: "EUR" },
    "gemini/pro": { input: 1, output: 8, thinking: 8 },
    "openai/bare": { input: 2, output: 6 },
  },
};

describe("priceKey", () => {
  it("is provider/model, never a bare model name", () => {
    // OpenRouter serves models whose names belong to other vendors: a bare name
    // would collide the moment somebody routes the same model two ways to
    // compare price.
    expect(priceKey("openrouter", "anthropic/claude-sonnet-5"))
      .toBe("openrouter/anthropic/claude-sonnet-5");
    expect(priceKey("anthropic", "claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });
});

describe("priceFor", () => {
  it("reads a full entry", () => {
    expect(priceFor(TABLE, "anthropic", "m")).toEqual({
      input: 3,
      output: 15,
      cachedInput: 0.3,
      cacheWrite: 3.75,
      thinking: 15,
      currency: "USD",
    });
  });

  it("lets an entry name its own currency", () => {
    // What makes an installation drawing on providers who bill differently
    // honest rather than approximately right (AD-21).
    expect(priceFor(TABLE, "mistral", "small")?.currency).toBe("EUR");
  });

  it("falls back to the table's default currency", () => {
    expect(priceFor(TABLE, "openai", "bare")?.currency).toBe("USD");
  });

  it("falls back again when the table names none", () => {
    expect(priceFor({ models: { "a/b": { input: 1, output: 1 } } }, "a", "b")?.currency)
      .toBe(DEFAULT_CURRENCY);
  });

  it("falls back to the OUTPUT rate for thinking, because that is how it is billed", () => {
    expect(priceFor(TABLE, "openai", "bare")?.thinking).toBe(6);
    expect(priceFor(TABLE, "gemini", "pro")?.thinking).toBe(8);
  });

  it("falls back to the INPUT rate for cached and cache-write", () => {
    // Over-states rather than under-states: better to look expensive than free.
    const price = priceFor(TABLE, "openai", "bare")!;
    expect(price.cachedInput).toBe(2);
    expect(price.cacheWrite).toBe(2);
  });

  it("returns null for a model with no entry — a real answer, not an error", () => {
    // A model with no price produces a row with token counts and NO cost, which
    // the report counts and names. Recording zero would produce a page reading
    // "0.00" for a month that cost real money.
    expect(priceFor(TABLE, "openai", "unknown-model")).toBeNull();
    expect(priceFor({}, "openai", "x")).toBeNull();
  });

  it("returns null for a malformed entry rather than half a price", () => {
    expect(priceFor({ models: { "a/b": { input: "three", output: 1 } } }, "a", "b")).toBeNull();
    expect(priceFor({ models: { "a/b": {} } }, "a", "b")).toBeNull();
  });
});

describe("costMicros", () => {
  const price = priceFor(TABLE, "anthropic", "m")!;

  it("is tokens × price-per-million, exactly", () => {
    // The unit cancellation: 1000 input tokens at 3 per million = 3000 micros.
    expect(costMicros({ inputTokens: 1000, outputTokens: 0 }, price)).toBe(3000);
    expect(costMicros({ inputTokens: 0, outputTokens: 1000 }, price)).toBe(15000);
  });

  it("prices the cached share separately, and subtracts it from the fresh part", () => {
    // 1000 total input, 900 of it cached: 100 × 3 + 900 × 0.3 = 300 + 270.
    expect(
      costMicros({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 900 }, price),
    ).toBe(570);
  });

  it("prices a cache write at its own rate and takes it out of fresh input too", () => {
    // Anthropic reports cache writes inside our input total. 1000 total, 900
    // cached, 50 written: 50 × 3 + 900 × 0.3 + 50 × 3.75.
    expect(
      costMicros(
        { inputTokens: 1000, outputTokens: 0, cachedInputTokens: 900, cacheWriteTokens: 50 },
        price,
      ),
    ).toBe(150 + 270 + 188);
  });

  it("never lets the fresh share go negative", () => {
    // A provider reporting more cached than total would otherwise produce a
    // NEGATIVE cost — a credit note that never happened.
    expect(
      costMicros({ inputTokens: 100, outputTokens: 0, cachedInputTokens: 900 }, price),
    ).toBe(Math.round(900 * 0.3));
  });

  it("handles a call with no output", () => {
    expect(costMicros({ inputTokens: 10, outputTokens: 0 }, price)).toBe(30);
  });

  it("handles a call that was entirely cached", () => {
    expect(
      costMicros({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 1000 }, price),
    ).toBe(300);
  });

  it("returns null when there is no usage or no price", () => {
    expect(costMicros(null, price)).toBeNull();
    expect(costMicros({ inputTokens: 1, outputTokens: 1 }, null)).toBeNull();
  });

  it("produces an integer, always", () => {
    const value = costMicros({ inputTokens: 7, outputTokens: 3 }, priceFor(TABLE, "mistral", "small")!);
    expect(Number.isInteger(value)).toBe(true);
  });
});

describe("estimateMicros", () => {
  it("prices a hypothetical call at the fresh-input rate", () => {
    // Nothing is cached before a call has been made, so an estimate that
    // assumed a cache hit would flatter every model that has one.
    expect(estimateMicros(priceFor(TABLE, "anthropic", "m")!, 1000, 500)).toBe(3000 + 7500);
  });
});

describe("formatMicros", () => {
  it("shows the amount with its currency", () => {
    expect(formatMicros(1_234_567, "USD")).toBe("1.2346 USD");
  });

  it("says nothing rather than zero when there is no cost", () => {
    expect(formatMicros(null, "EUR")).toBe("— EUR");
  });
});

describe("recommendedCurrency", () => {
  it("suggests EUR for German and USD otherwise", () => {
    expect(recommendedCurrency("de")).toBe("EUR");
    expect(recommendedCurrency("en")).toBe("USD");
    expect(recommendedCurrency("fr")).toBe("USD");
  });
});

describe("the shipped price table", () => {
  it("names a currency and when it was last checked", () => {
    expect(typeof prices.defaultCurrency).toBe("string");
    // Without a date nobody knows whether the numbers are a year old.
    expect(prices.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prices every model the shipped bindings actually use", () => {
    // Not a hard requirement of the layer — an unpriced model is recorded and
    // counted separately, by design. But shipping a template whose OWN default
    // has no price would put "no price on file" in front of every new customer
    // on their first `ai-check`.
    for (const [task, binding] of Object.entries(allBindings())) {
      expect(
        priceFor(prices, binding.provider, binding.model),
        `task "${task}" is bound to ${binding.provider}/${binding.model}, which has no price entry`,
      ).not.toBeNull();
    }
  });
});

describe("pricesUpdatedAt", () => {
  it("returns the shipped date", () => {
    expect(pricesUpdatedAt()).toBe(prices.updated);
  });

  it("is the only thing the cost page will format", () => {
    // The guard the assertion above cannot make: `updated` is hand-maintained,
    // and "soon" or "Juli 2026" in there would reach Intl.DateTimeFormat as an
    // Invalid Date. Whether that throws or merely renders "Invalid Date" in a
    // heading, a typo in a price file must not damage the page that exists to
    // tell the Operator about the price file. So only a real YYYY-MM-DD gets
    // through, and everything else becomes "no date on record".
    expect(pricesUpdatedAt()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${pricesUpdatedAt()}T00:00:00.000Z`))).toBe(false);
  });
});
