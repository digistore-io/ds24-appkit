// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The price table, with types on.
//
// The arithmetic lives in `pricing.mjs` next door — `scripts/ai/check.mjs`
// estimates what a call will cost with exactly the numbers this computes for a
// call that happened, and the scripts in this repo do not import TypeScript
// (CLAUDE.md → Three systems). One implementation, two readers.
import table from "@/config/ai-prices.json";

import { costMicros, priceFor } from "./pricing.mjs";
import { unexplainedTokens, type ProviderId, type Usage } from "./providers/types";

export interface Price {
  input: number;
  output: number;
  cachedInput: number;
  cacheWrite: number;
  thinking: number;
  /** Per PICTURE, in whole currency units — not per million. See `pricing.mjs`. */
  image: number;
  currency: string;
}

/** The price of one model, or null when there is none on file. */
export function priceOf(provider: ProviderId, model: string): Price | null {
  return priceFor(table, provider, model) as Price | null;
}

/**
 * When the numbers were last checked. Shown on the cost page.
 *
 * Only a real `YYYY-MM-DD` comes back. The field is hand-maintained, and
 * "soon" or "Juli" in there would otherwise reach `Intl.DateTimeFormat` as an
 * Invalid Date and take the whole cost page down with a 500 — a typo in a price
 * file must cost the Operator a line of text, not the page that would have told
 * them about it.
 */
export function pricesUpdatedAt(): string | null {
  const raw = typeof table.updated === "string" ? table.updated.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Number.isNaN(Date.parse(`${raw}T00:00:00.000Z`)) ? null : raw;
}

/** What the whole table is denominated in, for entries that name no currency. */
export function defaultCurrency(): string {
  return typeof table.defaultCurrency === "string" && table.defaultCurrency.trim() !== ""
    ? table.defaultCurrency.trim()
    : "USD";
}

/** Where a stored cost figure came from. */
export type CostSource = "computed" | "reported" | "none";

export interface CostOf {
  micros: number | null;
  currency: string | null;
  source: CostSource;
}

/**
 * What a call cost, and in what currency.
 *
 * Three outcomes, and the order between the first two is the decision:
 *
 *  1. **The provider told us.** OpenRouter returns the authoritative
 *     per-request cost, which beats any price table for a router that picks its
 *     upstream at request time. It is stored **in the currency the provider
 *     quoted** — USD — and never relabelled into whatever the price file
 *     happens to use. Relabelling would be inventing an exchange rate.
 *  2. **We computed it** from the token counts and the price entry, in that
 *     entry's currency.
 *  3. **Nobody could.** No price on file → `null`, and `null` is not zero
 *     (AD-17). A page reading "0.00" for a month that cost real money is worse
 *     than one that says how many calls it could not account for.
 */
export function costOf(
  provider: ProviderId,
  model: string,
  usage: Usage | null,
): CostOf {
  if (!usage) return { micros: null, currency: null, source: "none" };

  if (usage.reportedCostMicros !== null) {
    return {
      micros: usage.reportedCostMicros,
      currency: usage.reportedCostCurrency ?? defaultCurrency(),
      source: "reported",
    };
  }

  const price = priceOf(provider, model);
  if (!price) return { micros: null, currency: null, source: "none" };

  const micros = costMicros(
    { ...usage, unexplainedTokens: unexplainedTokens(usage) },
    price,
  );

  return micros === null
    ? { micros: null, currency: null, source: "none" }
    : { micros, currency: price.currency, source: "computed" };
}
