// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The registry, and the contract every adapter satisfies.
//
// The contract test is the one that matters when a sixth provider is added:
// it walks all of them rather than naming any, so a new entry is covered the
// moment it is registered.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  adapterFor,
  configuredProviders,
  envVarFor,
  imageAdapterFor,
  isConfigured,
  providersWithImages,
} from "./registry";
import {
  PROVIDER_CAPABILITIES,
  PROVIDER_DEFAULT_IMAGE_MODELS,
  providersThatCan,
} from "./ids.mjs";
import { PROVIDER_IDS, ProviderError, isProviderId, type ProviderId } from "./types";

const ENV_VARS: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of Object.values(ENV_VARS)) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("the five providers", () => {
  it("are all registered", () => {
    expect([...PROVIDER_IDS].sort()).toEqual(
      ["anthropic", "gemini", "mistral", "openai", "openrouter"],
    );
  });

  it("each name their own environment variable", () => {
    for (const provider of PROVIDER_IDS) {
      expect(envVarFor(provider)).toBe(ENV_VARS[provider]);
    }
    // Two providers sharing a variable would mean configuring one silently
    // configures the other.
    const vars = PROVIDER_IDS.map(envVarFor);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it("each satisfy the adapter contract", () => {
    for (const provider of PROVIDER_IDS) {
      process.env[ENV_VARS[provider]] = "test-key";
      const { adapter } = adapterFor(provider);
      expect(adapter.id).toBe(provider);
      expect(typeof adapter.complete).toBe("function");
      expect(typeof adapter.stream).toBe("function");
      delete process.env[ENV_VARS[provider]];
    }
  });

  it("are recognised by isProviderId, and nothing else is", () => {
    for (const provider of PROVIDER_IDS) expect(isProviderId(provider)).toBe(true);
    expect(isProviderId("cohere")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

describe("adapterFor", () => {
  it("refuses an unconfigured provider at RESOLVE time, not at call time", () => {
    // What makes FR-39a true: the binding is resolved before anything else, so
    // a call refused for a missing key is still recorded with the provider and
    // model it would have used.
    expect(() => adapterFor("openai")).toThrow(ProviderError);
    try {
      adapterFor("openai");
      expect.unreachable();
    } catch (error) {
      expect((error as ProviderError).code).toBe("noCredential");
      expect((error as ProviderError).provider).toBe("openai");
    }
  });

  it("names the environment variable to add, because 'no credential' does not", () => {
    try {
      adapterFor("mistral");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("MISTRAL_API_KEY");
    }
  });

  it("treats a blank key as no key", () => {
    process.env.OPENAI_API_KEY = "   ";
    expect(() => adapterFor("openai")).toThrow(ProviderError);
  });

  it("returns the key when one is set", () => {
    process.env.GEMINI_API_KEY = "abc";
    expect(adapterFor("gemini").key).toBe("abc");
  });
});

describe("isConfigured / configuredProviders", () => {
  it("reports nothing configured on a bare machine", () => {
    expect(configuredProviders()).toEqual([]);
    for (const provider of PROVIDER_IDS) expect(isConfigured(provider)).toBe(false);
  });

  it("lists only what has a key", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.OPENROUTER_API_KEY = "b";
    expect(configuredProviders().sort()).toEqual(["anthropic", "openrouter"]);
  });

  it("never returns a key", () => {
    process.env.ANTHROPIC_API_KEY = "super-secret";
    expect(JSON.stringify(configuredProviders())).not.toContain("super-secret");
  });

  it("answers rather than throwing when the id is not a provider at all", () => {
    // The id arrives from `config/ai-models.json`, a file a person edits, so
    // "not a provider" is a typo and not an impossible state. These two used to
    // index the registry unguarded and raise a TypeError — and they are what
    // `isChatEnabled()` calls from the dashboard LAYOUT, so one misspelt
    // provider took down every page under /dashboard rather than the chat.
    const unknown = "clause" as ProviderId;
    expect(() => isConfigured(unknown)).not.toThrow();
    expect(isConfigured(unknown)).toBe(false);
    expect(() => envVarFor(unknown)).not.toThrow();
  });
});

// ── Capabilities ────────────────────────────────────────────────────────────
//
// Two files say which companies can draw: `ids.mjs` as DATA, because
// `scripts/ai/check.mjs` has to read it without loading the app, and the
// registry as ADAPTERS, because that is where the code is. A second source of
// truth is only safe while something checks it against the first — the same
// deal `PROVIDERS_REPORTING_COST` already has with `usageAccounting`.
//
// The failure this prevents is quiet in the worst way: `ai-check` would report
// that a provider can produce images, an Operator would bind the task to it,
// and the refusal would arrive at the first customer who pressed the button.

describe("capabilities", () => {
  it("the data and the adapters agree about who can draw", () => {
    expect([...providersWithImages()].sort()).toEqual([...providersThatCan("image")].sort());
  });

  it("every provider that can draw has a default image model", () => {
    // Without one, `"auto"` resolves to a binding carrying `model: null` — an
    // unresolved binding, which is what naming defaults exists to prevent.
    const defaults = PROVIDER_DEFAULT_IMAGE_MODELS as Record<string, string | undefined>;
    for (const provider of providersThatCan("image")) {
      expect(defaults[provider], provider).toBeTruthy();
    }
  });

  it("every provider can at least write text", () => {
    for (const provider of PROVIDER_IDS) {
      expect(PROVIDER_CAPABILITIES[provider], provider).toContain("text");
    }
  });

  it("names Anthropic and Mistral as unable to draw, on purpose", () => {
    // Anthropic's own documentation says Claude reads pictures and does not
    // make them. Mistral CAN, but only through an agent tool whose result
    // arrives as a file id to download afterwards — a different protocol rather
    // than a different endpoint. `ids.mjs` carries that reasoning so nobody
    // re-derives it from an empty entry.
    expect(providersThatCan("image")).not.toContain("anthropic");
    expect(providersThatCan("image")).not.toContain("mistral");
  });
});

describe("imageAdapterFor", () => {
  it("refuses a provider that draws nothing, by name", () => {
    // The second line of defence. `bindingProblems()` reports the same mistake
    // at check time, which is where somebody can still act on it.
    process.env.ANTHROPIC_API_KEY = "k";
    expect(() => imageAdapterFor("anthropic")).toThrow(/does not produce images/);
  });

  it("refuses a provider that does not exist", () => {
    expect(() => imageAdapterFor("cohere" as ProviderId)).toThrow(/no such provider/);
  });

  it("asks for the key by the name of its environment variable", () => {
    // Whoever reads this needs to know which line to add to `.env`.
    expect(() => imageAdapterFor("openai")).toThrow(/OPENAI_API_KEY/);
  });

  it("hands back the adapter once the key is there", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { adapter, key } = imageAdapterFor("openai");
    expect(adapter.id).toBe("openai");
    expect(key).toBe("test-key");
  });

  it("serves OpenRouter through the same shape", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    expect(imageAdapterFor("openrouter").adapter.id).toBe("openrouter");
  });
});
