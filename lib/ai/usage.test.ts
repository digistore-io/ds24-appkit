// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What a usage row looks like, and what it deliberately does not contain.
//
// `rowFor` is pure so the shape can be asserted without a database — which
// matters more here than usual, because the two things most easily got wrong
// (content leaking in, "no usage" recorded as zero) are both invisible until
// somebody reads the cost page or a lawyer reads the export.
import { describe, expect, it } from "vitest";

import { logLine, rowFor, type UsageRecord } from "./usage";
import { emptyUsage, type Usage } from "./providers/types";

const USAGE: Usage = {
  ...emptyUsage(),
  inputTokens: 1000,
  outputTokens: 200,
  cachedInputTokens: 900,
  cacheWriteTokens: 10,
  thinkingTokens: 50,
  reportedTotalTokens: 1200,
};

const RECORD: UsageRecord = {
  task: "chat",
  provider: "anthropic",
  model: "claude-sonnet-5",
  memberId: "member-1",
  usage: USAGE,
  outcome: "ok",
  latencyMs: 1234,
};

describe("rowFor", () => {
  it("carries the counts through unchanged", () => {
    expect(rowFor(RECORD)).toMatchObject({
      task: "chat",
      provider: "anthropic",
      model: "claude-sonnet-5",
      memberId: "member-1",
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 900,
      cacheWriteTokens: 10,
      thinkingTokens: 50,
      outcome: "ok",
      latencyMs: 1234,
    });
  });

  it("names the provider and the model even when the call never happened", () => {
    // AD-20 / FR-39a. A call refused for a missing key is still recorded with
    // the provider and model it WOULD have used — usually the answer to "why is
    // nothing working".
    const row = rowFor({
      ...RECORD,
      usage: null,
      outcome: "noCredential",
    });
    expect(row.provider).toBe("anthropic");
    expect(row.model).toBe("claude-sonnet-5");
    expect(row.outcome).toBe("noCredential");
  });

  it("records 'the provider said nothing' as its own fact, not as zero", () => {
    // Zero tokens is a call that consumed nothing. No usage is a call nobody
    // measured. Recording the second as the first makes it look free.
    const row = rowFor({ ...RECORD, usage: null });
    expect(row.usageReported).toBe(false);
    expect(row.inputTokens).toBe(0);

    const measured = rowFor({ ...RECORD, usage: { ...emptyUsage() } });
    expect(measured.usageReported).toBe(true);
    expect(measured.inputTokens).toBe(0);
  });

  it("computes the unexplained tokens the reconciliation is built on", () => {
    // 1000 + 200 itemised against a reported total of 1200 → nothing missing.
    expect(rowFor(RECORD).unexplainedTokens).toBe(0);

    const gap = rowFor({
      ...RECORD,
      usage: { ...USAGE, reportedTotalTokens: 1500 },
    });
    expect(gap.unexplainedTokens).toBe(300);
  });

  it("prices the call and names the currency the price was quoted in", () => {
    const row = rowFor(RECORD);
    expect(row.costMicros).toBeGreaterThan(0);
    expect(row.currency).toBe("USD");
    expect(row.costSource).toBe("computed");
  });

  it("records NO cost for a model with no price on file — never zero", () => {
    // AD-17. A page reading "0.00" for a month that cost real money is worse
    // than one that says how many calls it could not account for.
    const row = rowFor({ ...RECORD, model: "a-model-nobody-priced" });
    expect(row.costMicros).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.costSource).toBe("none");
    // The counts survive — the call is still measured, just not priced.
    expect(row.inputTokens).toBe(1000);
  });

  it("prefers the provider's own figure, in the provider's own currency", () => {
    // OpenRouter quotes USD whatever the price file says. Relabelling it into
    // the table's currency would be inventing an exchange rate (AD-21).
    const row = rowFor({
      ...RECORD,
      usage: { ...USAGE, reportedCostMicros: 4242, reportedCostCurrency: "USD" },
    });
    expect(row.costMicros).toBe(4242);
    expect(row.currency).toBe("USD");
    expect(row.costSource).toBe("reported");
  });

  it("records no cost at all when nothing was measured", () => {
    const row = rowFor({ ...RECORD, usage: null });
    expect(row.costMicros).toBeNull();
    expect(row.costSource).toBe("none");
  });

  it("accepts a call made for nobody", () => {
    expect(rowFor({ ...RECORD, memberId: undefined }).memberId).toBeNull();
  });

  it("holds no field that could carry a prompt or an answer", () => {
    // The structural version of the privacy promise: there is no shape here
    // that HAS content on it, so nothing careless can leak one.
    const row = rowFor(RECORD) as Record<string, unknown>;
    const forbidden = ["prompt", "system", "messages", "content", "text", "answer", "completion"];
    for (const key of Object.keys(row)) {
      expect(forbidden).not.toContain(key.toLowerCase());
    }
    // And every value is a number, a boolean, a null or a short identifier —
    // never free text somebody typed.
    for (const value of Object.values(row)) {
      if (typeof value === "string") expect(value.length).toBeLessThan(200);
    }
  });
});

describe("logLine", () => {
  it("names the provider and the model", () => {
    // So the terminal and the cost page can never disagree about what ran.
    const line = logLine(RECORD);
    expect(line).toContain("provider=anthropic");
    expect(line).toContain("model=claude-sonnet-5");
    expect(line).toContain("task=chat");
  });

  it("is one grep-friendly line", () => {
    expect(logLine(RECORD).split("\n")).toHaveLength(1);
    expect(logLine(RECORD).startsWith("[ai] ")).toBe(true);
  });

  it("says so when nothing was measured", () => {
    expect(logLine({ ...RECORD, usage: null })).toContain("usage=none");
  });

  it("mentions thinking only when there was some", () => {
    expect(logLine(RECORD)).toContain("thinking=50");
    expect(logLine({ ...RECORD, usage: { ...USAGE, thinkingTokens: 0 } }))
      .not.toContain("thinking=");
  });

  it("carries no prompt and no answer", () => {
    const line = logLine({ ...RECORD, task: "chat" });
    expect(line).not.toMatch(/content|prompt|message/i);
  });
});
