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

export function isProviderId(value) {
  return PROVIDER_IDS.includes(value);
}
