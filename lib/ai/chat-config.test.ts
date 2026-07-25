import { describe, it, expect } from "vitest";

import {
  DEFAULT_CHAT_CONFIG,
  chatConfig,
  chatConfigProblems,
} from "./chat-config";

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
