import { afterEach, describe, it, expect, vi } from "vitest";

import {
  DEFAULT_CHAT_CONFIG,
  chatConfig,
  chatConfigProblems,
  chatOffReason,
  chatProviderEnvVar,
  chatProviderId,
  hasChatProviderKey,
  isChatEnabled,
} from "./chat-config";
// The typed list, so `PROVIDER_ENV_VARS[id]` is a lookup and not an `any`.
// `tasks.test.ts` is what keeps it in step with the .mjs copy.
import { PROVIDER_IDS } from "./providers/types";
import { PROVIDER_ENV_VARS } from "./providers/ids.mjs";

describe("the shipped config", () => {
  // The same job `lib/billing-mode.test.ts` does for the billing mode: a second
  // source of truth is only safe while something checks it against the first.
  //
  // Failing here? The message says which field. The most likely one is
  // `requiresPlan` naming a product that is not in
  // config/digistore-products.json — either add the product, correct the key,
  // or set it back to null so every signed-in member may use the chat.
  it("holds together", () => {
    expect(chatConfigProblems()).toEqual([]);
  });

  it("reads back with a usable name and avatar", () => {
    // The model is deliberately NOT here any more — which model answers is a
    // property of the `chat` TASK (config/ai-models.json), so a second task can
    // reach the same decision. `lib/ai/tasks.test.ts` covers it.
    const config = chatConfig();
    // Neither the model NOR the cache window is here any more — both are
    // properties of the `chat` TASK, so a second task can reach the same
    // decisions. A leftover of either is reported by name rather than ignored.
    expect(config).not.toHaveProperty("model");
    expect(config).not.toHaveProperty("cacheTtl");
    expect(config.name).not.toBe("");
    // The avatar is fetched by the browser, so it has to be a path under
    // `public/`, not a filesystem path somebody pasted from their machine.
    expect(config.avatar.startsWith("/")).toBe(true);
  });
});

describe("one key is enough to switch her on", () => {
  // The property a new app is judged on, asserted through the code path the
  // dashboard actually runs — not through `ai-check`, which is a different
  // implementation of the same question. The shipped `chat` binding is `"auto"`,
  // so each of the five keys on its own has to be sufficient. This is the test
  // that fails if somebody pins the shipped binding back to one company.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function withOnly(envVar: string) {
    for (const id of PROVIDER_IDS) vi.stubEnv(PROVIDER_ENV_VARS[id], "");
    vi.stubEnv(envVar, "sk-test-not-a-real-key");
  }

  for (const id of PROVIDER_IDS) {
    it(`runs on ${PROVIDER_ENV_VARS[id]} alone`, () => {
      withOnly(PROVIDER_ENV_VARS[id]);
      expect(hasChatProviderKey()).toBe(true);
      expect(chatProviderId()).toBe(id);
      expect(chatProviderEnvVar()).toBe(PROVIDER_ENV_VARS[id]);
      expect(isChatEnabled()).toBe(true);
      expect(chatOffReason()).toBeNull();
    });
  }

  it("stays off, and says why, when there is no key at all", () => {
    for (const id of PROVIDER_IDS) vi.stubEnv(PROVIDER_ENV_VARS[id], "");
    expect(isChatEnabled()).toBe(false);
    // Not "disabledInConfig" and not "brokenConfig": the product wants her and
    // the config is fine — this machine simply cannot reach anybody.
    expect(chatOffReason()).toBe("noApiKey");
  });
});

describe("chatConfig", () => {
  it("keeps the bounds that stop one message costing a fortune", () => {
    const config = chatConfig();
    expect(config.maxHistoryTurns).toBeGreaterThan(0);
    expect(config.maxHistoryTurns).toBeLessThanOrEqual(100);
    expect(config.maxMessagesPer10Min).toBeGreaterThan(0);
  });
});

describe("the direction a broken config fails in", () => {
  it("is off", () => {
    // Deliberately the opposite of `billingMode()`, which falls back to showing
    // everything. A wrong billing mode hides a card; a chat that switches
    // itself on because a field was unreadable spends money per visitor. Off is
    // visible and recoverable — the page names the file and the reason.
    expect(DEFAULT_CHAT_CONFIG.enabled).toBe(false);
  });
});
