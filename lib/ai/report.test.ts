// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The pure half of the cost report: periods, time zones and buckets.
//
// The queries are not tested here — they need a database, and what they do is
// SQL. What IS tested is everything that decides WHICH rows a query asks for,
// because that is where a cost page goes quietly wrong: a boundary an hour out
// moves a night's traffic onto the wrong day, and nothing errors.
//
// Europe/Berlin is used throughout because it is the shipped default and it has
// a DST shift — the two days a year that break every hand-rolled date helper.
import { describe, expect, it } from "vitest";

import {
  addDaysInZone,
  bucketLabelFor,
  bucketLabels,
  cacheShare,
  isFocused,
  parseFocus,
  parseView,
  rangeFor,
  startOfDayInZone,
  startOfMonthInZone,
  withEmptyBuckets,
  zoneOffsetMs,
  type GroupRow,
  type Summary,
} from "./report";

const BERLIN = "Europe/Berlin";
const HOUR = 60 * 60 * 1000;

describe("zoneOffsetMs", () => {
  it("is +1h in Berlin in winter and +2h in summer", () => {
    expect(zoneOffsetMs(new Date("2026-01-15T12:00:00Z"), BERLIN)).toBe(HOUR);
    expect(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), BERLIN)).toBe(2 * HOUR);
  });

  it("is 0 for UTC", () => {
    expect(zoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("ignores the milliseconds of the instant", () => {
    // `formatToParts` has no sub-second precision, so a naive subtraction would
    // return 3_599_123 instead of 3_600_000 and put every boundary a fraction
    // of a second out.
    expect(zoneOffsetMs(new Date("2026-01-15T12:00:00.877Z"), BERLIN)).toBe(HOUR);
  });
});

describe("startOfDayInZone", () => {
  it("is 23:00 UTC the day before, in Berlin winter", () => {
    const start = startOfDayInZone(new Date("2026-01-15T09:30:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("is 22:00 UTC the day before, in Berlin summer", () => {
    const start = startOfDayInZone(new Date("2026-07-15T09:30:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("is right on the day the clocks go forward", () => {
    // 2026-03-29: the shift happens at 02:00 local, so midnight is still +01:00
    // even though the offset at midday is +02:00. Reading the offset once —
    // at midday — would answer 2026-03-28T22:00Z, which is the evening BEFORE
    // the day it claims to start.
    const start = startOfDayInZone(new Date("2026-03-29T12:00:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });

  it("is right on the day the clocks go back", () => {
    const start = startOfDayInZone(new Date("2026-10-25T12:00:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("is idempotent", () => {
    const once = startOfDayInZone(new Date("2026-03-29T12:00:00Z"), BERLIN);
    expect(startOfDayInZone(once, BERLIN).toISOString()).toBe(once.toISOString());
  });
});

describe("startOfMonthInZone", () => {
  it("finds the first of the month in local time", () => {
    const start = startOfMonthInZone(new Date("2026-07-24T09:00:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("does not slip a month for a call just after local midnight", () => {
    // 2026-07-01T00:30 local is 2026-06-30T22:30Z. A UTC-based month start
    // would file it under June and the month total would open short.
    const start = startOfMonthInZone(new Date("2026-06-30T22:30:00Z"), BERLIN);
    expect(start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
});

describe("addDaysInZone", () => {
  it("counts calendar days, not 24-hour blocks, across the spring shift", () => {
    // 2026-03-30 local midnight is 2026-03-29T22:00Z (CEST). Six flat days back
    // is 2026-03-23T22:00Z — which is 23:00 local on the 23rd, so truncating
    // lands on the 22nd and the "last 7 days" quietly becomes eight.
    const start = startOfDayInZone(new Date("2026-03-30T09:00:00Z"), BERLIN);
    expect(addDaysInZone(start, -6, BERLIN).toISOString()).toBe("2026-03-23T23:00:00.000Z");
    expect(new Date(start.getTime() - 6 * 24 * HOUR).toISOString()).toBe(
      "2026-03-23T22:00:00.000Z",
    );
  });

  it("counts calendar days across the autumn shift", () => {
    const start = startOfDayInZone(new Date("2026-10-26T09:00:00Z"), BERLIN);
    expect(addDaysInZone(start, -6, BERLIN).toISOString()).toBe("2026-10-19T22:00:00.000Z");
  });

  it("rolls over a month and a year end", () => {
    expect(
      addDaysInZone(startOfDayInZone(new Date("2026-03-02T09:00:00Z"), BERLIN), -2, BERLIN)
        .toISOString(),
    ).toBe("2026-02-27T23:00:00.000Z");
    expect(
      addDaysInZone(startOfDayInZone(new Date("2026-01-01T09:00:00Z"), BERLIN), -1, BERLIN)
        .toISOString(),
    ).toBe("2025-12-30T23:00:00.000Z");
  });
});

describe("rangeFor", () => {
  const now = new Date("2026-07-24T09:00:00Z"); // 11:00 in Berlin

  it("today starts at local midnight and ends now", () => {
    const range = rangeFor("today", now, BERLIN);
    expect(range.from.toISOString()).toBe("2026-07-23T22:00:00.000Z");
    expect(range.to).toBe(now);
  });

  it("7d covers seven days INCLUDING today", () => {
    const range = rangeFor("7d", now, BERLIN);
    // 24th back to the 18th is seven calendar days, not six.
    expect(range.from.toISOString()).toBe("2026-07-17T22:00:00.000Z");
  });

  it("30d covers thirty days including today", () => {
    const range = rangeFor("30d", now, BERLIN);
    expect(range.from.toISOString()).toBe("2026-06-24T22:00:00.000Z");
  });

  it("month starts on the first, not thirty days ago", () => {
    const range = rangeFor("month", now, BERLIN);
    expect(range.from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("never reaches into the future", () => {
    for (const period of ["today", "7d", "30d", "month"] as const) {
      expect(rangeFor(period, now, BERLIN).to.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("survives a range that spans the spring shift", () => {
    const afterShift = new Date("2026-03-30T09:00:00Z");
    const range = rangeFor("7d", afterShift, BERLIN);
    // 30th back to the 24th — still seven days, even though one of them was
    // 23 hours long.
    expect(range.from.toISOString()).toBe("2026-03-23T23:00:00.000Z");
  });
});

describe("bucketLabelFor", () => {
  it("labels a day by its LOCAL date", () => {
    // 2026-07-24T23:30Z is already the 25th in Berlin. A UTC truncation would
    // file it under the 24th — the single most common way a cost page ends up
    // disagreeing with an invoice.
    expect(bucketLabelFor(new Date("2026-07-24T23:30:00Z"), "day", BERLIN)).toBe("2026-07-25");
    expect(bucketLabelFor(new Date("2026-07-24T23:30:00Z"), "day", "UTC")).toBe("2026-07-24");
  });

  it("starts weeks on Monday, like date_trunc", () => {
    // 2026-07-24 is a Friday; 2026-07-26 a Sunday.
    expect(bucketLabelFor(new Date("2026-07-24T09:00:00Z"), "week", BERLIN)).toBe("2026-07-20");
    expect(bucketLabelFor(new Date("2026-07-26T09:00:00Z"), "week", BERLIN)).toBe("2026-07-20");
    // Monday itself is its own bucket, not the one before.
    expect(bucketLabelFor(new Date("2026-07-27T09:00:00Z"), "week", BERLIN)).toBe("2026-07-27");
  });

  it("labels a month by its first day", () => {
    expect(bucketLabelFor(new Date("2026-07-24T09:00:00Z"), "month", BERLIN)).toBe("2026-07-01");
  });
});

describe("bucketLabels", () => {
  const now = new Date("2026-07-24T09:00:00Z");

  it("is empty when there is no time grouping", () => {
    expect(bucketLabels(rangeFor("30d", now, BERLIN), "none", BERLIN)).toEqual([]);
  });

  it("names every day of the period, in order, with none missing", () => {
    const labels = bucketLabels(rangeFor("7d", now, BERLIN), "day", BERLIN);
    expect(labels).toEqual([
      "2026-07-18",
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
  });

  it("gives today one bucket even minutes after midnight", () => {
    const justAfterMidnight = new Date("2026-07-23T22:05:00Z");
    const labels = bucketLabels(rangeFor("today", justAfterMidnight, BERLIN), "day", BERLIN);
    expect(labels).toEqual(["2026-07-24"]);
  });

  it("neither skips nor repeats a day across the spring shift", () => {
    const labels = bucketLabels(
      rangeFor("7d", new Date("2026-03-30T09:00:00Z"), BERLIN),
      "day",
      BERLIN,
    );
    // The 29th is 23 hours long. Stepping by a flat 24h would land twice on the
    // 30th and never on the 29th at all.
    expect(labels).toEqual([
      "2026-03-24",
      "2026-03-25",
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("neither skips nor repeats a day across the autumn shift", () => {
    const labels = bucketLabels(
      rangeFor("7d", new Date("2026-10-26T09:00:00Z"), BERLIN),
      "day",
      BERLIN,
    );
    expect(labels).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });

  it("collapses a month of days into weeks and months", () => {
    const range = rangeFor("30d", now, BERLIN);
    const weeks = bucketLabels(range, "week", BERLIN);
    expect(weeks[0]).toBe("2026-06-22");
    expect(weeks.at(-1)).toBe("2026-07-20");
    expect(new Set(weeks).size).toBe(weeks.length);

    expect(bucketLabels(range, "month", BERLIN)).toEqual(["2026-06-01", "2026-07-01"]);
  });

  it("agrees with bucketLabelFor for every instant in the range", () => {
    // The guard that matters: a label the walker never produces is a bucket the
    // gap-filler cannot match, and the row would then appear twice.
    const range = rangeFor("7d", now, BERLIN);
    const labels = new Set(bucketLabels(range, "day", BERLIN));
    for (let t = range.from.getTime(); t < range.to.getTime(); t += 37 * 60 * 1000) {
      expect(labels.has(bucketLabelFor(new Date(t), "day", BERLIN))).toBe(true);
    }
  });
});

describe("withEmptyBuckets", () => {
  const row = (bucket: string, key: string, cost: number | null): GroupRow => ({
    bucket,
    key,
    currency: cost === null ? "" : "EUR",
    costMicros: cost,
    calls: 1,
    inputTokens: 10,
    outputTokens: 5,
    unpricedCalls: cost === null ? 1 : 0,
  });

  it("puts back a day nobody called anything on", () => {
    const filled = withEmptyBuckets(
      [row("2026-07-22", "chat", 100), row("2026-07-24", "chat", 200)],
      ["2026-07-22", "2026-07-23", "2026-07-24"],
    );
    expect(filled.map((r) => r.bucket)).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
    expect(filled[1].empty).toBe(true);
    // Not a zero: an empty bucket has no cost, and "0.00 EUR" would be a claim.
    expect(filled[1].costMicros).toBeNull();
    expect(filled[1].calls).toBe(0);
  });

  it("leaves the real rows alone", () => {
    const filled = withEmptyBuckets([row("2026-07-22", "chat", 100)], ["2026-07-22"]);
    expect(filled).toHaveLength(1);
    expect(filled[0].empty).toBe(false);
    expect(filled[0].costMicros).toBe(100);
  });

  it("does nothing when there is no time grouping", () => {
    const rows = [row("", "chat", 100), row("", "content.draft", 50)];
    expect(withEmptyBuckets(rows, [])).toHaveLength(2);
  });

  it("keeps two currencies in the same bucket apart", () => {
    const eur = row("2026-07-22", "chat", 100);
    const usd = { ...row("2026-07-22", "chat", 200), currency: "USD" };
    const filled = withEmptyBuckets([eur, usd], ["2026-07-22"]);
    expect(filled).toHaveLength(2);
    expect(filled.map((r) => r.currency).sort()).toEqual(["EUR", "USD"]);
  });
});

describe("cacheShare", () => {
  const summary = (inputTokens: number, cachedInputTokens: number): Summary => ({
    totals: [],
    calls: 1,
    inputTokens,
    outputTokens: 0,
    cachedInputTokens,
    unpricedCalls: 0,
    failedCalls: 0,
    unexplainedTokens: 0,
  });

  it("is the cached share of input", () => {
    expect(cacheShare(summary(1000, 900))).toBe(90);
  });

  it("is null rather than 0 when there was no input at all", () => {
    // 0% reads as "the cache collapsed", which is a different and alarming fact.
    expect(cacheShare(summary(0, 0))).toBeNull();
  });

  it("reports a collapsed cache as 0", () => {
    expect(cacheShare(summary(1000, 0))).toBe(0);
  });
});

describe("parseView", () => {
  it("defaults to the last 30 days, by task, no time grouping", () => {
    expect(parseView({})).toEqual({ period: "30d", dimension: "task", granularity: "none" });
  });

  it("reads all three from the query string", () => {
    expect(parseView({ period: "today", by: "model", over: "day" })).toEqual({
      period: "today",
      dimension: "model",
      granularity: "day",
    });
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    // These values come from anybody. A cost page that 500s on `?period=lol`
    // is a cost page somebody can take down.
    expect(parseView({ period: "lol", by: "'; drop table", over: "42" })).toEqual({
      period: "30d",
      dimension: "task",
      granularity: "none",
    });
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseView({ period: ["today", "month"] }).period).toBe("today");
  });
});

describe("parseFocus", () => {
  it("is empty when nothing is focused", () => {
    expect(parseFocus({})).toEqual({ task: undefined, model: undefined, bucket: undefined });
    expect(isFocused(parseFocus({}))).toBe(false);
  });

  it("reads a task, a model and a bucket", () => {
    const focus = parseFocus({
      task: "chat",
      model: "openrouter/openai/gpt-5.1",
      bucket: "2026-07-23",
    });
    expect(focus).toEqual({
      task: "chat",
      // Slashes in a model id are ordinary — OpenRouter names them that way.
      model: "openrouter/openai/gpt-5.1",
      bucket: "2026-07-23",
    });
    expect(isFocused(focus)).toBe(true);
  });

  it("treats an empty parameter as no focus at all", () => {
    // `?task=` is what a link built without a value produces. Matching on the
    // empty string would return no calls and look like a broken page.
    expect(parseFocus({ task: "" }).task).toBeUndefined();
    expect(isFocused(parseFocus({ task: "", model: "" }))).toBe(false);
  });

  it("drops a bucket that is not a date", () => {
    // Otherwise it reaches the date formatter and the heading reads
    // "Individual calls — Invalid Date", quoting the query string back.
    expect(parseFocus({ bucket: "schrott" }).bucket).toBeUndefined();
    expect(parseFocus({ bucket: "2026-7-3" }).bucket).toBeUndefined();
    expect(parseFocus({ bucket: "2026-07-23" }).bucket).toBe("2026-07-23");
  });

  it("drops an absurdly long value", () => {
    expect(parseFocus({ task: "x".repeat(5000) }).task).toBeUndefined();
  });
});
