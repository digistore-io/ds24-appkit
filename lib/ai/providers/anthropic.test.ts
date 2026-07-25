import { describe, expect, it } from "vitest";

import { buildParams, buildSystem, textFrom, usageFrom } from "./anthropic";
import { unexplainedTokens, type NormalizedRequest } from "./types";

const REQUEST: NormalizedRequest = {
  model: "claude-sonnet-5",
  system: [
    { text: "persona", cacheable: true },
    { text: "handbook", cacheable: true },
    { text: "today is 2026-07-25" },
  ],
  messages: [{ role: "user", content: "hello" }],
  maxTokens: 4000,
  timeoutMs: 1000,
};

describe("buildSystem", () => {
  it("puts exactly ONE breakpoint, on the last cacheable block", () => {
    // One and not several: the API allows four, and every extra breakpoint is
    // another prefix to write and pay for. What this layer models is a single
    // boundary — stable before it, varying after.
    const system = buildSystem(REQUEST);
    expect(system.map((b) => Boolean(b.cache_control))).toEqual([false, true, false]);
  });

  it("defaults the cache window to an hour", () => {
    expect(buildSystem(REQUEST)[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("honours a cacheTtl from the binding", () => {
    const system = buildSystem({ ...REQUEST, providerOptions: { cacheTtl: "5m" } });
    expect(system[1].cache_control?.ttl).toBe("5m");
  });

  it("ignores a cacheTtl that is not one of the two Anthropic offers", () => {
    const system = buildSystem({ ...REQUEST, providerOptions: { cacheTtl: "3 weeks" } });
    expect(system[1].cache_control?.ttl).toBe("1h");
  });

  it("sets NO breakpoint when nothing is cacheable", () => {
    // Marking a varying prefix cacheable pays the write premium on every
    // request and never reads it back.
    const system = buildSystem({ ...REQUEST, system: [{ text: "varies" }] });
    expect(system.every((b) => b.cache_control === undefined)).toBe(true);
  });

  it("refuses a prompt whose cacheable block follows a varying one", () => {
    expect(() =>
      buildSystem({
        ...REQUEST,
        system: [{ text: "varies" }, { text: "stable", cacheable: true }],
      }),
    ).toThrow(/cacheable block follows/);
  });

  it("drops empty blocks so an empty one cannot become the breakpoint", () => {
    const system = buildSystem({
      ...REQUEST,
      system: [{ text: "a", cacheable: true }, { text: "" }, { text: "b" }],
    });
    expect(system).toHaveLength(2);
    expect(system[0].text).toBe("a");
  });
});

describe("buildParams", () => {
  it("passes the model, the cap and the conversation through", () => {
    const params = buildParams(REQUEST);
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(4000);
    expect(params.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("forwards providerOptions but consumes cacheTtl, which is ours", () => {
    const params = buildParams({
      ...REQUEST,
      providerOptions: { cacheTtl: "5m", thinking: { type: "adaptive" } },
    });
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params).not.toHaveProperty("cacheTtl");
  });
});

describe("usageFrom", () => {
  it("adds the cache figures into input, because Anthropic reports them apart", () => {
    // THE Anthropic-specific trap. `input_tokens` here EXCLUDES cache reads and
    // writes, unlike every other provider in this directory where the input
    // figure is the total. Missing this under-reports input on every cached
    // call — which is to say, on every assistant answer.
    const usage = usageFrom({
      input_tokens: 12,
      output_tokens: 40,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 88,
    })!;
    expect(usage.inputTokens).toBe(1000);
    expect(usage.cachedInputTokens).toBe(900);
    expect(usage.cacheWriteTokens).toBe(88);
    expect(usage.outputTokens).toBe(40);
  });

  it("reports no total, so the reconciliation has nothing to flag", () => {
    // Correct rather than a gap: the three input figures plus output are the
    // whole bill, so there is nothing left over to be unexplained.
    const usage = usageFrom({ input_tokens: 10, output_tokens: 5 })!;
    expect(usage.reportedTotalTokens).toBeNull();
    expect(unexplainedTokens(usage)).toBe(0);
  });

  it("carries no thinking figure, because thinking is inside output here", () => {
    expect(usageFrom({ input_tokens: 1, output_tokens: 1 })!.thinkingTokens).toBe(0);
  });

  it("returns null when the provider said nothing", () => {
    expect(usageFrom(undefined)).toBeNull();
  });

  it("treats a missing cache figure as zero, not as absent usage", () => {
    const usage = usageFrom({ input_tokens: 10, output_tokens: 5 })!;
    expect(usage.cachedInputTokens).toBe(0);
    expect(usage.inputTokens).toBe(10);
  });
});

describe("textFrom", () => {
  it("joins the text blocks and ignores the rest", () => {
    expect(
      textFrom([
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  it("is empty rather than throwing on an unexpected shape", () => {
    expect(textFrom(undefined)).toBe("");
    expect(textFrom([])).toBe("");
  });
});
