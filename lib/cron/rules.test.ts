// The scheduling rules, and the config that feeds them.
//
// The runner is not tested here — it needs a database, and what it does is one
// conditional UPDATE. What IS tested is every decision the runner asks this
// file to make, because those are the ones that fail quietly: a job that is
// never due looks exactly like a job with nothing to do.
import { describe, expect, it } from "vitest";

import {
  JOB_DEFAULTS,
  STALE_LOCK_MINUTES,
  configProblems,
  describeEvery,
  dueBefore,
  isDue,
  normalizeJob,
  retentionCutoff,
  staleLockBefore,
} from "./rules.mjs";
import { cronConfigProblems, jobSettings, schedulerEnabled } from "./config";
import { CRON_JOBS, JOB_IDS, AI_USAGE_RETENTION_MONTHS } from "./jobs";

const NOW = new Date("2026-07-25T09:00:00Z");
const MINUTE = 60_000;

describe("normalizeJob", () => {
  it("inherits the defaults when nothing is configured", () => {
    expect(normalizeJob(undefined)).toEqual(JOB_DEFAULTS);
    expect(normalizeJob({})).toEqual(JOB_DEFAULTS);
  });

  it("keeps the job's own settings alongside the schedule", () => {
    // A job's own knobs — retentionMonths and the like — travel through
    // untouched. The scheduler does not know what they mean and must not.
    const job = normalizeJob({ everyMinutes: 60, retentionMonths: 3 });
    expect(job.everyMinutes).toBe(60);
    expect(job.retentionMonths).toBe(3);
  });

  it("is only off when it says false", () => {
    expect(normalizeJob({ enabled: false }).enabled).toBe(false);
    expect(normalizeJob({ enabled: true }).enabled).toBe(true);
    // Anything else is a typo, and a typo must not silently stop a retention
    // job — see the failure direction documented in config.ts.
    expect(normalizeJob({ enabled: "no" }).enabled).toBe(true);
    expect(normalizeJob({}).enabled).toBe(true);
  });

  it("refuses an interval that would mean a hot loop", () => {
    // 0, a negative or a non-number would make every tick claim the job
    // straight back, which is a DELETE across a table every minute for ever.
    for (const bad of [0, -5, "daily", null, NaN, undefined]) {
      expect(normalizeJob({ everyMinutes: bad }).everyMinutes).toBe(JOB_DEFAULTS.everyMinutes);
    }
    expect(normalizeJob({ everyMinutes: 1 }).everyMinutes).toBe(1);
    expect(normalizeJob({ everyMinutes: 90.7 }).everyMinutes).toBe(90);
  });
});

describe("isDue", () => {
  const daily = normalizeJob({ everyMinutes: 1440 });

  it("is due when it has never run", () => {
    // A fresh deploy should do its first cleanup rather than wait a day, and a
    // job whose row was removed should recover on its own.
    expect(isDue(daily, null, NOW)).toBe(true);
  });

  it("is not due again inside its interval", () => {
    expect(isDue(daily, new Date(NOW.getTime() - 60 * MINUTE), NOW)).toBe(false);
  });

  it("is due once the interval has passed", () => {
    expect(isDue(daily, new Date(NOW.getTime() - 1441 * MINUTE), NOW)).toBe(true);
  });

  it("is due exactly ON the interval, not a tick later", () => {
    expect(isDue(daily, new Date(NOW.getTime() - 1440 * MINUTE), NOW)).toBe(true);
  });

  it("is never due when it is switched off", () => {
    const off = normalizeJob({ enabled: false });
    expect(isDue(off, null, NOW)).toBe(false);
  });
});

describe("dueBefore / staleLockBefore", () => {
  it("dueBefore is the interval back from now", () => {
    expect(dueBefore(normalizeJob({ everyMinutes: 30 }), NOW).toISOString()).toBe(
      "2026-07-25T08:30:00.000Z",
    );
  });

  it("a lock goes stale after the stale window", () => {
    expect(staleLockBefore(NOW).getTime()).toBe(NOW.getTime() - STALE_LOCK_MINUTES * MINUTE);
  });

  it("the stale window is longer than the shortest useful interval", () => {
    // If a lock could go stale while a job of that interval was still running,
    // two instances would run it side by side.
    expect(STALE_LOCK_MINUTES).toBeGreaterThan(1);
  });
});

describe("retentionCutoff", () => {
  it("counts calendar months, not thirty-day blocks", () => {
    // Somebody who writes 12 means "the same date last year". 12 × 30 days is
    // 5 days short of it, every year, and nothing would say so.
    expect(retentionCutoff(12, NOW)?.toISOString()).toBe("2025-07-25T09:00:00.000Z");
    expect(retentionCutoff(3, NOW)?.toISOString()).toBe("2026-04-25T09:00:00.000Z");
  });

  it("normalises a date that the shorter month does not have", () => {
    // 31 March minus one month. Postgres would say 28 February; JS says
    // 3 March. Either is defensible for a retention cutoff — what matters is
    // that it is a real date and not an Invalid Date.
    const cutoff = retentionCutoff(1, new Date("2026-03-31T00:00:00Z"));
    expect(Number.isNaN(cutoff!.getTime())).toBe(false);
  });

  it("crosses a year end", () => {
    expect(retentionCutoff(2, new Date("2026-01-15T00:00:00Z"))?.toISOString()).toBe(
      "2025-11-15T00:00:00.000Z",
    );
  });

  it("refuses an absent value rather than reading it as zero", () => {
    // ⚠️ The one that matters. `Number(null)` is 0, and so is `Number("")` and
    // `Number(false)` — every one of them a perfectly valid-looking zero-month
    // retention, which is "delete everything". A `"retentionMonths": null` left
    // behind while editing the config would empty the table on the next tick
    // and report success.
    for (const bad of [null, undefined, "", "  ", false, true, [], {}, "twelve", NaN]) {
      expect(retentionCutoff(bad, NOW)).toBeNull();
    }
    for (const bad of [-1, -0.5]) {
      expect(retentionCutoff(bad, NOW)).toBeNull();
    }
  });

  it("allows a deliberate zero, written as a number", () => {
    // Somebody who genuinely wants nothing kept has to say so with a 0.
    expect(retentionCutoff(0, NOW)?.toISOString()).toBe(NOW.toISOString());
    expect(retentionCutoff("0", NOW)?.toISOString()).toBe(NOW.toISOString());
  });
});

describe("describeEvery", () => {
  it("says it the way a person would", () => {
    expect(describeEvery(1440)).toBe("daily");
    expect(describeEvery(2880)).toBe("every 2 days");
    expect(describeEvery(60)).toBe("hourly");
    expect(describeEvery(360)).toBe("every 6 h");
    expect(describeEvery(15)).toBe("every 15 min");
  });
});

describe("configProblems", () => {
  const known = ["prune-ai-usage"];

  it("says nothing about a coherent file", () => {
    expect(configProblems({ enabled: true, jobs: { "prune-ai-usage": {} } }, known)).toEqual([]);
  });

  it("says nothing about a job that is simply not configured", () => {
    // Inheriting the defaults is normal, exactly as a declared AI task with no
    // binding is normal.
    expect(configProblems({ enabled: true }, known)).toEqual([]);
  });

  it("names a job that does not exist", () => {
    // The mistake that actually gets made — usually a rename — and it fails
    // silently, because a job nobody looks up is a job that never runs.
    const problems = configProblems({ jobs: { "prune-ai-usag": {} } }, known);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("prune-ai-usag");
    expect(problems[0]).toContain("prune-ai-usage");
  });

  it("names an interval that is not one", () => {
    const problems = configProblems({ jobs: { "prune-ai-usage": { everyMinutes: 0 } } }, known);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("everyMinutes");
  });

  it("refuses a file that is not the right shape", () => {
    expect(configProblems(null, known)).toHaveLength(1);
    expect(configProblems({ jobs: [] }, known)).toHaveLength(1);
    expect(configProblems({ jobs: { "prune-ai-usage": 5 } }, known)).toHaveLength(1);
  });
});

describe("the shipped config/cron.json", () => {
  it("is coherent", () => {
    // The same deal `tasks.test.ts` makes for the AI bindings: a second source
    // of truth is only safe while something checks it against the first. A
    // renamed job would otherwise ship as a job that never runs.
    expect(cronConfigProblems()).toEqual([]);
  });

  it("has the scheduler on, so a fresh install cleans up after itself", () => {
    expect(schedulerEnabled()).toBe(true);
  });

  it("keeps AI usage for twelve months", () => {
    const settings = jobSettings("prune-ai-usage");
    expect(settings.enabled).toBe(true);
    expect(settings.retentionMonths).toBe(AI_USAGE_RETENTION_MONTHS);
    expect(settings.everyMinutes).toBe(1440);
  });

  it("gives every registered job a unique id", () => {
    expect(new Set(JOB_IDS).size).toBe(JOB_IDS.length);
  });

  it("keeps ids.mjs and the registry in step", () => {
    // The names live in `ids.mjs` so that `config.ts` — and through it
    // `instrumentation.ts` — can validate the config without importing the
    // database. That split is only safe while something checks it: a job added
    // to the registry and not to the list would be a job nobody could
    // configure, reported as "does not exist" by the very file meant to
    // configure it.
    expect([...JOB_IDS].sort()).toEqual(CRON_JOBS.map((job) => job.id).sort());
  });

  it("gives every registered job a description, because --list prints it", () => {
    for (const job of CRON_JOBS) {
      expect(job.describe.length).toBeGreaterThan(10);
    }
  });
});
