// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The five provider names and the environment variable each one's key lives in.
//
// ── Why this one file is .mjs in a TypeScript project ──────────────────────
// Two very different things have to agree on this list: the app
// (`lib/ai/providers/registry.ts`, running inside Next.js) and the command line
// (`scripts/ai/check.mjs`, plain Node, no bundler, no TypeScript). The scripts
// in this repo deliberately do not import the app's TypeScript — see CLAUDE.md,
// "Three systems" — so the alternative was to write the list twice and let the
// two drift until `ai-check` says a provider is configured and the app says it
// is not.
//
// Same reasoning, same shape as `lib/ai/frontmatter.mjs`. Keep it dependency-
// free and keep it pure: it is imported by a Next.js server bundle and by a
// bare `node scripts/…` on Windows alike.

/** The five companies this app can call. Order is the display order. */
export const PROVIDER_IDS = ["anthropic", "openai", "gemini", "mistral", "openrouter"];

/**
 * Which environment variable holds each provider's key.
 *
 * Pure data, and deliberately here rather than beside each adapter: the check
 * command has to be able to say "set MISTRAL_API_KEY in .env" without loading
 * the adapter that would need the key it is complaining about.
 */
export const PROVIDER_ENV_VARS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/**
 * A sensible model per provider — what `"auto"` picks once it knows the company.
 *
 * This exists because a key alone is not enough to make a call: a model id
 * belongs to exactly one company, and `claude-sonnet-5` on Mistral is a 404.
 * So the thing an Operator can supply (a key) has to imply the thing they
 * cannot be expected to know (that company's current model id).
 *
 * Each one is the vendor's own current general-purpose model, taken from their
 * documentation rather than from memory — a model id is a per-provider claim
 * and this template verifies those before writing them down. **They go stale.**
 * A model retired by its vendor produces a 404 on the first question, and the
 * fix is one line here (or a pinned `model` in `config/ai-models.json`, which
 * always wins). `node run.mjs ai-check` prints which one is in use.
 *
 * `openrouter/auto-beta` is that company's own router rather than a model —
 * the right answer for a provider whose whole product is choosing one.
 */
export const PROVIDER_DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.6-luna",
  gemini: "gemini-3.6-flash",
  mistral: "mistral-large-latest",
  openrouter: "openrouter/auto-beta",
};

/**
 * Providers that tell us what a call actually cost, so no price is needed.
 *
 * `costOf()` in `lib/ai/prices.ts` prefers a reported figure over the table —
 * it is the invoice rather than our arithmetic about it. Named here because
 * `ai-check` has to know: without it, the one provider that already answers
 * the money question perfectly is the one it nags you to add a price for.
 *
 * The flag itself lives on the adapter (`usageAccounting` in
 * `openai-compat.ts`); this is the copy the check command can read, and
 * `openai-compat.test.ts` fails the build if the two ever disagree.
 */
export const PROVIDERS_REPORTING_COST = ["openrouter"];

/**
 * What each company can actually do.
 *
 * ── Why this is data and not a try-and-see ─────────────────────────────────
 * Anthropic and Mistral write text and draw nothing. Without this list, binding
 * the `image` task to one of them produces a perfectly valid-looking config
 * that fails at the first customer who presses the button — with the reason in
 * a server log nobody is watching. With it, `node run.mjs ai-check` and
 * `taskProblems()` say so at the moment the config is written, which is the
 * same deal this layer already makes for a misspelt provider and a model pinned
 * beside `"auto"`.
 *
 * It is a claim about somebody else's product, so it goes stale the way
 * `PROVIDER_DEFAULT_MODELS` does. A provider that gains a capability is one
 * line here.
 */
export const PROVIDER_CAPABILITIES = {
  // Confirmed by Anthropic's own vision documentation: Claude reads pictures
  // and does not make them.
  anthropic: ["text"],
  openai: ["text", "image"],
  gemini: ["text", "image"],
  // Mistral CAN generate images — but only as a built-in tool on an agent,
  // driven through the Conversations API, with the result arriving as a file id
  // to download afterwards. That is a different protocol rather than a
  // different endpoint, and this layer would have to grow an agent/file concept
  // that nothing else needs. Listed as text-only deliberately, and this comment
  // is the reason so nobody re-derives it from an empty entry.
  mistral: ["text"],
  openrouter: ["text", "image"],
};

export function providerCan(provider, capability) {
  return (PROVIDER_CAPABILITIES[provider] ?? []).includes(capability);
}

/** Every provider that can do a thing — for the message that says which key would work. */
export function providersThatCan(capability) {
  return PROVIDER_IDS.filter((id) => providerCan(id, capability));
}

/**
 * A sensible image model per provider — what `"auto"` picks for an image task.
 *
 * Separate from `PROVIDER_DEFAULT_MODELS` because a company's general-purpose
 * text model cannot draw: binding the image task to `"auto"` and landing on
 * `claude-sonnet-5` would make the shipped default the one combination that
 * never works.
 *
 * Verified against each vendor's own documentation on 2026-07-30, and **they go
 * stale** exactly as the text defaults do — a retired model id is a 404 on the
 * first picture. `node run.mjs ai-check` prints which one is in use, and a
 * pinned `model` in `config/ai-models.json` always wins.
 *
 * `openrouter/auto` is that company's router rather than a model, which is the
 * right answer for a provider whose product is choosing one.
 */
export const PROVIDER_DEFAULT_IMAGE_MODELS = {
  openai: "gpt-image-2",
  gemini: "gemini-3.1-flash-image",
  openrouter: "openai/gpt-image-2",
};

export function isProviderId(value) {
  return PROVIDER_IDS.includes(value);
}
