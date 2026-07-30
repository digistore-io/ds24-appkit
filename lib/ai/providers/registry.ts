// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Provider id → adapter + credential. **The only file in this app that reads an
// AI provider's API key.**
//
// That is the whole point of the directory. Everything above this layer names a
// task; this names a company; nothing else does either. `lib/ai/providers/leak-guard.test.ts`
// fails the build if a vendor SDK or a provider environment variable turns up
// anywhere outside `lib/ai/providers/`.
//
// ── Keys live in the environment ───────────────────────────────────────────
// Same rule as the Digistore24 credentials (`lib/digistore/settings.ts`): a key
// belongs to the operator of the installation, lives in `.env` (in
// STAGING/PROD in the hoster's secret management), and there is deliberately no
// UI to type it into. A form that writes a provider key to the database is a
// form that reads it back out.
//
// ── An unconfigured provider fails at RESOLVE time ─────────────────────────
// `adapterFor` throws `noCredential` before any request is built. That is what
// makes FR-39a true: the binding is resolved first, so a call refused for a
// missing key is still recorded with the provider and model it would have used
// — which is usually the answer to "why is nothing working".
import {
  PROVIDER_IDS,
  ProviderError,
  type Adapter,
  type ImageAdapter,
  type ProviderId,
} from "./types";
import { ANTHROPIC_ENV_VAR, anthropicAdapter } from "./anthropic";
import { GEMINI_ENV_VAR, geminiAdapter } from "./gemini";
import { geminiImageAdapter } from "./image-gemini";
import { openaiImageAdapter, openrouterImageAdapter } from "./image-openai";
import { COMPAT_PROFILES, compatAdapter } from "./openai-compat";

interface Entry {
  adapter: Adapter;
  envVar: string;
  /**
   * The image adapter, where the company has one.
   *
   * Absent rather than a method that throws: two of the five draw nothing, and
   * that is a fact about their product rather than a runtime condition.
   * `PROVIDER_CAPABILITIES` in `ids.mjs` is the copy `node run.mjs ai-check`
   * reads — `registry.test.ts` fails the build if the two disagree, the same
   * arrangement `PROVIDERS_REPORTING_COST` already has with `usageAccounting`.
   */
  imageAdapter?: ImageAdapter;
}

/**
 * Every provider this app can call.
 *
 * Adding a sixth is one entry here plus either a profile (if it speaks the
 * OpenAI shape and bills only for what it itemises) or a file (if it does not).
 * Nothing above this line changes — not a call site, not a task, not the usage
 * schema, not the cost report.
 */
const REGISTRY: Record<ProviderId, Entry> = {
  anthropic: { adapter: anthropicAdapter, envVar: ANTHROPIC_ENV_VAR },
  gemini: {
    adapter: geminiAdapter,
    envVar: GEMINI_ENV_VAR,
    imageAdapter: geminiImageAdapter,
  },
  openai: {
    adapter: compatAdapter(COMPAT_PROFILES.openai),
    envVar: COMPAT_PROFILES.openai.envVar,
    imageAdapter: openaiImageAdapter,
  },
  mistral: {
    adapter: compatAdapter(COMPAT_PROFILES.mistral),
    envVar: COMPAT_PROFILES.mistral.envVar,
  },
  openrouter: {
    adapter: compatAdapter(COMPAT_PROFILES.openrouter),
    envVar: COMPAT_PROFILES.openrouter.envVar,
    imageAdapter: openrouterImageAdapter,
  },
};

/**
 * Which environment variable holds this provider's key. For the check command.
 *
 * Guarded rather than a bare lookup: the id arrives from `config/ai-models.json`
 * by way of `bindingFor()`, and a file a person edits is a file that can name a
 * provider that does not exist. `adapterFor` below has always refused that by
 * name; these two answered with a `TypeError` instead — and they are the pair
 * `isChatEnabled()` calls from the dashboard layout, so the crash landed on
 * every protected page rather than on the chat.
 */
export function envVarFor(provider: ProviderId): string {
  return REGISTRY[provider]?.envVar ?? "";
}

/** Is a credential present for this provider? Never returns the key itself. */
export function isConfigured(provider: ProviderId): boolean {
  const entry = REGISTRY[provider];
  if (!entry) return false;
  return Boolean(process.env[entry.envVar]?.trim());
}

/** Every provider with a credential on this machine. For the check command. */
export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter(isConfigured);
}

/**
 * The adapter and the key for one provider.
 *
 * Throws `ProviderError("noCredential")` naming the environment variable —
 * because the person reading that message needs to know which line to add to
 * `.env`, and "no credential" on its own does not tell them.
 */
export function adapterFor(provider: ProviderId): { adapter: Adapter; key: string } {
  const entry = REGISTRY[provider];
  if (!entry) {
    throw new ProviderError("unknownModel", `no such provider: ${provider}`);
  }

  const key = process.env[entry.envVar]?.trim();
  if (!key) {
    throw new ProviderError(
      "noCredential",
      `${provider} is not configured — set ${entry.envVar} in .env`,
      provider,
    );
  }

  return { adapter: entry.adapter, key };
}

/** Which providers this registry can actually draw with. For the capability test. */
export function providersWithImages(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => Boolean(REGISTRY[id]?.imageAdapter));
}

/**
 * The image adapter and the key for one provider.
 *
 * Refuses a company that draws nothing with `unknownModel` naming it, rather
 * than with a generic failure — but this is the second line of defence, not the
 * first. `bindingProblems()` reports the same mistake at check time, which is
 * where somebody can still do something about it.
 */
export function imageAdapterFor(
  provider: ProviderId,
): { adapter: ImageAdapter; key: string } {
  const entry = REGISTRY[provider];
  if (!entry) {
    throw new ProviderError("unknownModel", `no such provider: ${provider}`);
  }
  if (!entry.imageAdapter) {
    throw new ProviderError(
      "unknownModel",
      `${provider} does not produce images — bind the image task to a provider that does ` +
        `(node run.mjs ai-check says which)`,
      provider,
    );
  }

  const key = process.env[entry.envVar]?.trim();
  if (!key) {
    throw new ProviderError(
      "noCredential",
      `${provider} is not configured — set ${entry.envVar} in .env`,
      provider,
    );
  }

  return { adapter: entry.imageAdapter, key };
}
