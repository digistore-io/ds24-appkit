// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The system prompt, as five providers need to see it. Pure.
//
// Two providers take a list of blocks (Anthropic keeps them, so it can put a
// cache breakpoint between two of them). Three take a single string. This file
// is the one place that knows how to go from one to the other without losing
// the property the whole abstraction exists to preserve: **the cacheable part
// has to be a stable prefix.**
import { ProviderError, type PromptBlock } from "./types";

/**
 * Is this prompt shaped so caching can work?
 *
 * The rule is one line — no cacheable block may follow a varying one — and
 * breaking it is worth failing over rather than warning about. A prompt where
 * a stable block sits after a volatile one has a prefix that changes on every
 * request, so:
 *
 *   - Anthropic's breakpoint lands after content that varies → cache never hits
 *   - Gemini's and OpenAI's implicit caching sees a new prefix every time
 *
 * and in all three cases there is no error, no failing test and no slower
 * answer. Just an input bill several times what it should be, discovered on an
 * invoice weeks later. That is exactly the failure `lib/ai/prompt.ts` was
 * written to prevent for one feature; this generalises it to every task.
 */
export function isCacheableOrderValid(system: readonly PromptBlock[]): boolean {
  let seenVarying = false;
  for (const block of system) {
    if (block.cacheable) {
      if (seenVarying) return false;
    } else {
      seenVarying = true;
    }
  }
  return true;
}

/** Throws when the order is wrong. Called by every adapter before it builds. */
export function assertCacheableOrder(system: readonly PromptBlock[]): void {
  if (isCacheableOrderValid(system)) return;
  throw new ProviderError(
    "providerFailed",
    "system prompt: a cacheable block follows a varying one, so the prefix is " +
      "not stable and caching cannot work. Put everything that varies last — " +
      "see lib/ai/prompt.ts.",
  );
}

/** Index of the last block marked cacheable, or -1. Where a breakpoint goes. */
export function lastCacheableIndex(system: readonly PromptBlock[]): number {
  let found = -1;
  for (let i = 0; i < system.length; i++) {
    if (system[i].cacheable) found = i;
  }
  return found;
}

/**
 * The blocks as one string, for providers that take a single system prompt.
 *
 * ⚠️ This is where the guarantee has to survive without any help from the
 * provider. The ORDER is the whole mechanism for OpenAI, Gemini, Mistral and
 * OpenRouter — the stable text ends up at the front of the string, so the
 * automatic prefix caching those providers do has something stable to match.
 * Joining in any other order, sorting, deduplicating or trimming individual
 * blocks would break it silently.
 *
 * Two newlines between blocks, always — a separator that varies would move
 * every byte after it.
 */
export function flattenBlocks(system: readonly PromptBlock[]): string {
  return system
    .map((block) => block.text)
    .filter((text) => text !== "")
    .join("\n\n");
}

/**
 * Are there enough characters before the last cacheable block for a provider's
 * implicit caching to engage at all?
 *
 * Gemini does not cache below its model's minimum request size — 1,024 tokens
 * on 2.5 Flash, 2,048 on 2.5 Pro, up to 4,096 on some models — and neither
 * says so nor errors. This is a rough character-based check used only to
 * explain that in a log or a check command: below the threshold, "the cache is
 * not working" is the wrong diagnosis, because it was never eligible.
 *
 * Characters and not tokens on purpose: a real token count means an API call
 * (or a tokenizer dependency), and this answers a question that only needs an
 * order of magnitude. Four characters per token is the usual rough figure.
 */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimatedCacheablePrefixTokens(system: readonly PromptBlock[]): number {
  const last = lastCacheableIndex(system);
  if (last < 0) return 0;
  const chars = system
    .slice(0, last + 1)
    .reduce((sum, block) => sum + block.text.length, 0);
  return Math.floor(chars / CHARS_PER_TOKEN_ESTIMATE);
}
