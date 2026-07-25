import { describe, expect, it } from "vitest";

import {
  FALLBACK_BINDING,
  TASKS as TASK_IDS,
  bindingProblems,
  resolveBinding,
} from "./task-rules.mjs";
import { TASKS, allBindings, bindingFor, isTaskId, taskConfigProblems } from "./tasks";
import { PROVIDER_IDS } from "./providers/types";
import { PROVIDER_IDS as MJS_PROVIDER_IDS, PROVIDER_ENV_VARS } from "./providers/ids.mjs";

const ALL_PROVIDERS = [...PROVIDER_IDS];

describe("the two copies of each list agree", () => {
  it("TASKS is the same in the .ts and the .mjs", () => {
    // The .mjs holds the list the check command reads; the .ts holds the union
    // type the compiler enforces. They cannot be derived from one another, so
    // this is what stops them drifting.
    expect([...TASKS]).toEqual([...TASK_IDS]);
  });

  it("PROVIDER_IDS is the same in the .ts and the .mjs", () => {
    expect([...PROVIDER_IDS]).toEqual([...MJS_PROVIDER_IDS]);
  });

  it("every provider has an environment variable named for it", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_ENV_VARS[id]).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

describe("the shipped registry", () => {
  it("declares exactly one task, because one task exists", () => {
    // Content generation and moderation are what the layer MAKES POSSIBLE and
    // live as worked examples in the docs — not here, because a bound task
    // nobody calls is a line `ai-check` complains about for ever.
    expect([...TASKS]).toEqual(["chat"]);
  });

  it("recognises its own tasks and nothing else", () => {
    expect(isTaskId("chat")).toBe(true);
    expect(isTaskId("chatt")).toBe(false);
    expect(isTaskId(undefined)).toBe(false);
  });
});

describe("config/ai-models.json", () => {
  it("is structurally coherent", () => {
    // The same deal `lib/billing-mode.test.ts` makes: a second source of truth
    // is only safe while something checks it against the first. Credentials are
    // deliberately NOT checked here — a developer's machine legitimately has no
    // keys, and `node run.mjs ai-check` is where that is reported.
    expect(taskConfigProblems()).toEqual([]);
  });

  it("binds every declared task to a real provider and a named model", () => {
    for (const [task, binding] of Object.entries(allBindings())) {
      expect(PROVIDER_IDS, `task ${task}`).toContain(binding.provider);
      expect(binding.model.trim(), `task ${task}`).not.toBe("");
      expect(binding.maxTokens, `task ${task}`).toBeGreaterThan(0);
    }
  });

  it("gives the chat task the cache window its economics depend on", () => {
    // Not a style assertion: the assistant sends her whole handbook on every
    // question, and the TTL is what decides whether that is billed once an hour
    // or once every five minutes.
    expect(bindingFor("chat").providerOptions.cacheTtl).toBe("1h");
  });
});

describe("resolveBinding", () => {
  const config = {
    default: { provider: "anthropic", model: "d-model", maxTokens: 100 },
    tasks: { chat: { provider: "openai", model: "c-model" } },
  };

  it("prefers the task's own entry", () => {
    expect(resolveBinding(config, "chat")).toMatchObject({
      provider: "openai",
      model: "c-model",
    });
  });

  it("inherits what the task does not state", () => {
    // maxTokens is not on the chat entry, so it comes from default.
    expect(resolveBinding(config, "chat").maxTokens).toBe(100);
  });

  it("falls back to the default for a task with no entry at all", () => {
    // A declared task with no binding WORKS. Adding a task is a one-line change
    // — the config is optional, the declaration is not.
    expect(resolveBinding(config, "somethingElse")).toMatchObject({
      provider: "anthropic",
      model: "d-model",
    });
  });

  it("falls back again when the config says nothing", () => {
    expect(resolveBinding({}, "chat")).toMatchObject({
      provider: FALLBACK_BINDING.provider,
      model: FALLBACK_BINDING.model,
    });
    expect(resolveBinding(undefined, "chat").maxTokens).toBe(FALLBACK_BINDING.maxTokens);
  });

  it("merges providerOptions rather than replacing them", () => {
    const merged = resolveBinding(
      {
        default: { providerOptions: { cacheTtl: "1h", a: 1 } },
        tasks: { chat: { providerOptions: { a: 2, b: 3 } } },
      },
      "chat",
    );
    expect(merged.providerOptions).toEqual({ cacheTtl: "1h", a: 2, b: 3 });
  });

  it("refuses a nonsensical maxTokens rather than passing it on", () => {
    expect(resolveBinding({ default: { maxTokens: 0 } }, "chat").maxTokens)
      .toBe(FALLBACK_BINDING.maxTokens);
    expect(resolveBinding({ default: { maxTokens: -5 } }, "chat").maxTokens)
      .toBe(FALLBACK_BINDING.maxTokens);
    expect(resolveBinding({ default: { maxTokens: "many" } }, "chat").maxTokens)
      .toBe(FALLBACK_BINDING.maxTokens);
  });
});

describe("bindingProblems", () => {
  it("is silent on a coherent config", () => {
    expect(
      bindingProblems(
        { default: { provider: "anthropic", model: "m" } },
        ALL_PROVIDERS,
      ),
    ).toEqual([]);
  });

  it("catches a binding for a task that does not exist", () => {
    // Almost always a typo, and it silently does nothing — which is why it is
    // an error and not a warning.
    const problems = bindingProblems(
      { default: { provider: "anthropic", model: "m" }, tasks: { chatt: {} } },
      ALL_PROVIDERS,
    );
    expect(problems.join(" ")).toContain('tasks."chatt"');
    expect(problems.join(" ")).toContain("no such task");
  });

  it("catches an unknown provider and lists the real ones", () => {
    const problems = bindingProblems(
      { default: { provider: "cohere", model: "m" } },
      ALL_PROVIDERS,
    );
    expect(problems.join(" ")).toContain("cohere");
    expect(problems.join(" ")).toContain("anthropic");
  });

  it("catches a missing model", () => {
    expect(
      bindingProblems({ default: { provider: "anthropic", model: "  " } }, ALL_PROVIDERS)
        .join(" "),
    ).toContain("model");
  });

  it("names the environment variable when the key is missing", () => {
    // "no credential" does not tell somebody which line to add to .env.
    const problems = bindingProblems(
      { default: { provider: "mistral", model: "m" } },
      [], // nothing configured
    );
    expect(problems.join(" ")).toContain("MISTRAL_API_KEY");
    expect(problems.join(" ")).toContain("chat");
  });

  it("names a tuning option left behind by the previous provider", () => {
    // The one edit everybody makes: provider and model changed, providerOptions
    // forgotten. Anthropic's `thinking` reaches Mistral as a field it never
    // defined — an error on the customer's first message unless it is caught
    // here, in the command somebody runs right after making the change.
    const problems = bindingProblems(
      {
        default: { provider: "anthropic", model: "m" },
        tasks: {
          chat: {
            provider: "mistral",
            model: "m",
            providerOptions: { thinking: { type: "adaptive" } },
          },
        },
      },
      ALL_PROVIDERS,
    );
    expect(problems.join(" ")).toContain('providerOptions."thinking"');
    expect(problems.join(" ")).toContain("anthropic");
    expect(problems.join(" ")).toContain("mistral");
  });

  it("says of cacheTtl that it does nothing here, not that it breaks", () => {
    // It is ours and every adapter strips it, so the call works. What is wrong
    // is the belief: somebody set a cache window on a provider that has none.
    const problems = bindingProblems(
      { default: { provider: "openai", model: "m", providerOptions: { cacheTtl: "1h" } } },
      ALL_PROVIDERS,
    );
    expect(problems.join(" ")).toContain("does nothing");
  });

  it("leaves an option it has never heard of alone", () => {
    // providerOptions is the escape hatch. Five providers add parameters faster
    // than this template can track them, so an unknown key is somebody using
    // the hatch — not a mistake to refuse.
    expect(
      bindingProblems(
        {
          default: {
            provider: "openai",
            model: "m",
            providerOptions: { some_new_flag_from_last_tuesday: true },
          },
        },
        ALL_PROVIDERS,
      ),
    ).toEqual([]);
  });

  it("is silent about an option the bound provider owns", () => {
    expect(
      bindingProblems(
        {
          default: {
            provider: "anthropic",
            model: "m",
            providerOptions: { cacheTtl: "1h", thinking: { type: "adaptive" } },
          },
        },
        ALL_PROVIDERS,
      ),
    ).toEqual([]);
  });

  it("counts an OpenAI option as understood by Mistral and OpenRouter", () => {
    // One request shape, three providers (openai-compat.ts). Being generous
    // here is deliberate: a false accusation blocks a config that works.
    expect(
      bindingProblems(
        {
          default: {
            provider: "openrouter",
            model: "m",
            providerOptions: { reasoning_effort: "low" },
          },
        },
        ALL_PROVIDERS,
      ),
    ).toEqual([]);
  });

  it("reports the provider problem and stops, rather than piling on", () => {
    // An unknown provider has no environment variable to be missing, so
    // complaining about both would send somebody chasing a second error that
    // disappears when they fix the first.
    const problems = bindingProblems(
      { default: { provider: "cohere", model: "m" } },
      [],
    );
    expect(problems).toHaveLength(1);
  });
});
