// Turning token counts into money. Pure, and the only arithmetic in this layer.
//
// ── The unit cancellation, once ────────────────────────────────────────────
// Prices are quoted per MILLION tokens. Money is stored in MICROS (millionths
// of a currency unit), the same integer discipline `orders.amountCents` uses,
// one step finer because a call can cost 0.0004 of a unit.
//
//     tokens ÷ 1_000_000  ×  price  ×  1_000_000 micros-per-unit  =  tokens × price
//
// So `costMicros = tokens × pricePerMillion`, exactly. A model at 3 per million
// costs 3,000 micros for 1,000 input tokens. Writing that out removes a whole
// class of rounding bug that would otherwise be found on an invoice.
//
// ── Why .mjs ───────────────────────────────────────────────────────────────
// `scripts/ai/check.mjs` estimates what a call will cost, and `lib/ai/usage.ts`
// computes what one did cost. Same arithmetic, two readers, and the scripts here
// do not import TypeScript (CLAUDE.md → Three systems).

/** Fallback when the price file names none. */
export const DEFAULT_CURRENCY = "USD";

/**
 * The currency recommended for an installation, by its language.
 *
 * A RECOMMENDATION and never a rule (FR-42a): a provider bills in what it bills
 * in, and refusing a currency would only push somebody into entering a
 * hand-converted number with no rate and no date attached to it — the worst
 * possible place for an exchange rate to live. `ai-check` suggests; nothing
 * enforces.
 */
export function recommendedCurrency(locale) {
  return locale === "de" ? "EUR" : "USD";
}

/** The key a price entry is filed under. `provider/model`, never bare model. */
export function priceKey(provider, model) {
  return `${provider}/${model}`;
}

/**
 * The price entry for one model, with its currency resolved.
 *
 * Returns null when there is none — and that is a real answer, not an error.
 * A model with no price produces a usage row carrying its token counts and NO
 * cost, which the report then counts and names. Recording zero instead would
 * produce a page reading "0.00" for a month that cost real money.
 *
 * The key is `provider/model` because OpenRouter serves models whose names
 * belong to other vendors: a bare model name would collide the moment somebody
 * routes the same model two ways to compare price.
 */
export function priceFor(table, provider, model) {
  const entry = table?.models?.[priceKey(provider, model)];
  if (!entry || typeof entry !== "object") return null;

  const input = Number(entry.input);
  const output = Number(entry.output);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;

  return {
    input,
    output,
    // Cached input is far cheaper than fresh input wherever it is reported;
    // absent, it falls back to the full input rate, which over-states rather
    // than under-states. Better to look expensive than to look free.
    cachedInput: Number.isFinite(Number(entry.cachedInput)) ? Number(entry.cachedInput) : input,
    // A cache WRITE costs more than plain input (Anthropic charges 1.25x/2x).
    // Absent, the input rate is the closest honest guess.
    cacheWrite: Number.isFinite(Number(entry.cacheWrite)) ? Number(entry.cacheWrite) : input,
    // Thinking is billed as output where it is billed at all, so that is the
    // fallback — and it is why a Gemini entry MAY name its own rate but need
    // not (PRD §9.7).
    thinking: Number.isFinite(Number(entry.thinking)) ? Number(entry.thinking) : output,
    currency:
      typeof entry.currency === "string" && entry.currency.trim() !== ""
        ? entry.currency.trim()
        : (typeof table?.defaultCurrency === "string" && table.defaultCurrency.trim() !== ""
            ? table.defaultCurrency.trim()
            : DEFAULT_CURRENCY),
  };
}

/**
 * What a call cost, in micros of the price entry's currency.
 *
 * Rounded PER TERM rather than once at the end, so each term can be checked
 * independently against a provider's own invoice line.
 *
 * `inputTokens` is the TOTAL including the cached part — that is how every
 * adapter in this repo normalizes it — so the cached share is subtracted before
 * the fresh part is priced. Getting that sign wrong produces a plausible-looking
 * number, which is the kind of wrong that survives review.
 */
export function costMicros(usage, price) {
  if (!usage || !price) return null;

  const cached = Math.max(0, usage.cachedInputTokens ?? 0);
  const cacheWrite = Math.max(0, usage.cacheWriteTokens ?? 0);
  // Anthropic reports cache writes inside our `inputTokens` total as well, so
  // both cached-read and cache-write tokens come off before the rest is priced
  // at the fresh-input rate.
  const fresh = Math.max(0, (usage.inputTokens ?? 0) - cached - cacheWrite);

  // Billed but not itemised (FR-43a). Priced at the OUTPUT rate — the
  // conservative choice, because where this happens at all it is thinking, and
  // thinking is billed as output. Pricing it lower would reproduce exactly the
  // undercount the reconciliation exists to catch.
  const unexplained = Math.max(0, usage.unexplainedTokens ?? 0);

  return (
    Math.round(fresh * price.input) +
    Math.round(cached * price.cachedInput) +
    Math.round(cacheWrite * price.cacheWrite) +
    Math.round((usage.outputTokens ?? 0) * price.output) +
    Math.round(unexplained * price.output)
  );
}

/**
 * What a call of a given shape would cost — for the check command, before any
 * call has been made.
 *
 * An ESTIMATE, and labelled as one wherever it is printed: nobody knows how
 * long an answer will be. It exists so an Operator choosing between two models
 * sees the order of magnitude at the moment they choose, rather than on an
 * invoice.
 */
export function estimateMicros(price, inputTokens, outputTokens) {
  return costMicros(
    {
      inputTokens,
      outputTokens,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    },
    price,
  );
}

/** Micros as a human-readable amount. `1234567` → `"1.234567"`. */
export function formatMicros(micros, currency, digits = 4) {
  if (micros === null || micros === undefined) return `— ${currency}`;
  return `${(micros / 1_000_000).toFixed(digits)} ${currency}`;
}
