// The registry, and the contract every adapter satisfies.
//
// The contract test is the one that matters when a sixth provider is added:
// it walks all of them rather than naming any, so a new entry is covered the
// moment it is registered.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adapterFor, configuredProviders, envVarFor, isConfigured } from "./registry";
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
