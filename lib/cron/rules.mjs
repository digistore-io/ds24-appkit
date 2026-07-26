// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// When a job is due, when a lock is stale, and what a broken config looks like.
//
// Pure — no database, no clock of its own, no `Date.now()`. Every function
// takes the time it should reason about, which is what makes a scheduler
// testable at all: "is this daily job due at 03:00 on the day the clocks go
// back" is a question you can only ask a function that lets you choose the day.
//
// ── Why .mjs ───────────────────────────────────────────────────────────────
// `scripts/cron/run.mjs` prints the schedule without a running app, and
// `lib/cron/config.ts` reads the same rules inside it. One implementation, two
// readers — the pattern `lib/ai/pricing.mjs` established.

/** A job with nothing configured. Every job inherits these. */
export const JOB_DEFAULTS = Object.freeze({
  enabled: true,
  everyMinutes: 1440, // daily
});

/**
 * How long a claimed lock is honoured before it is treated as abandoned.
 *
 * A process that dies mid-job leaves `lockedAt` set and nothing clears it. Too
 * short and two instances run the same job concurrently; too long and one crash
 * stops a daily job for days. An hour is longer than any job here takes by
 * three orders of magnitude, and shorter than the shortest useful interval.
 */
export const STALE_LOCK_MINUTES = 60;

/**
 * How often the in-app scheduler looks for work.
 *
 * NOT the resolution of the schedule — a job set to `everyMinutes: 5` runs
 * every five minutes because the tick asks the database whether it is due, not
 * because the tick is five minutes. This is only the cost of asking, and asking
 * is one indexed UPDATE per job.
 */
export const TICK_MINUTES = 1;

const MINUTE_MS = 60_000;

/** The settings for one job: the file's entry over the defaults. */
export function normalizeJob(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  const every = configuredNumber(entry.everyMinutes);
  return {
    ...JOB_DEFAULTS,
    ...entry,
    enabled: entry.enabled !== false,
    // A non-number, a zero or a negative would mean "run on every tick, for
    // ever". Falling back is right here: a typo in a schedule must not turn
    // into a hot loop against the database.
    everyMinutes: every !== null && every >= 1 ? Math.floor(every) : JOB_DEFAULTS.everyMinutes,
  };
}

/**
 * A job is due when it last FINISHED longer ago than its interval.
 *
 * Never run at all → due. That is deliberate: a freshly deployed app should do
 * its first cleanup rather than wait a day for it, and a job whose row was
 * removed should recover on its own.
 */
export function isDue(job, lastFinishedAt, now) {
  if (!job.enabled) return false;
  if (!lastFinishedAt) return true;
  return now.getTime() - lastFinishedAt.getTime() >= job.everyMinutes * MINUTE_MS;
}

/** The instant a lock must predate to count as abandoned. */
export function staleLockBefore(now) {
  return new Date(now.getTime() - STALE_LOCK_MINUTES * MINUTE_MS);
}

/** The instant a job must have finished before to be due again. */
export function dueBefore(job, now) {
  return new Date(now.getTime() - job.everyMinutes * MINUTE_MS);
}

/**
 * A configured number, or null when the value is not one.
 *
 * ⚠️ The reason this is not `Number(value)`: **`Number(null)` is 0, and so is
 * `Number("")` and `Number(false)`.** Every one of those reads as a perfectly
 * valid zero, and zero months of retention means *delete everything*. A
 * `"retentionMonths": null` left behind while editing the config would empty
 * the table on the next tick and report success.
 *
 * So a value counts only if it is genuinely a number, or a string that is
 * entirely one. Anything else is not a small window — it is an absent answer,
 * and the caller falls back to its default.
 */
export function configuredNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The cutoff for a retention window given in MONTHS.
 *
 * Calendar months, not "30 days times n": "twelve months" in a retention policy
 * means the same date last year, and a customer who wrote 12 into the config
 * and got 360 days has been given something other than what they asked for.
 * `setUTCMonth` normalises a short month by itself — 31 March minus one month
 * is 3 March, which is the conventional and defensible answer.
 */
export function retentionCutoff(months, now) {
  const n = configuredNumber(months);
  if (n === null || n < 0) return null;
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Math.floor(n));
  return cutoff;
}

/** "every 24 h" / "every 15 min" — for the check command and the log line. */
export function describeEvery(everyMinutes) {
  if (everyMinutes % 1440 === 0) {
    const days = everyMinutes / 1440;
    return days === 1 ? "daily" : `every ${days} days`;
  }
  if (everyMinutes % 60 === 0) {
    const hours = everyMinutes / 60;
    return hours === 1 ? "hourly" : `every ${hours} h`;
  }
  return `every ${everyMinutes} min`;
}

/**
 * Everything wrong with `config/cron.json` — empty when it is coherent.
 *
 * The same deal `taskProblems()` makes for the AI bindings: a second source of
 * truth is only safe while something checks it against the first. A job named
 * in the config that does not exist in the registry is the mistake that
 * actually gets made — usually a rename — and it fails silently, because a job
 * that is never looked up is a job that never runs.
 */
export function configProblems(raw, knownJobs) {
  const problems = [];
  if (!raw || typeof raw !== "object") return ["config/cron.json is not an object."];

  const jobs = raw.jobs;
  if (jobs !== undefined && (typeof jobs !== "object" || jobs === null || Array.isArray(jobs))) {
    return ['config/cron.json: "jobs" must be an object.'];
  }

  for (const [id, entry] of Object.entries(jobs ?? {})) {
    if (!knownJobs.includes(id)) {
      problems.push(
        `config/cron.json names a job "${id}" that does not exist. ` +
          `Known jobs: ${knownJobs.join(", ")}.`,
      );
      continue;
    }
    if (entry && typeof entry === "object") {
      const every = entry.everyMinutes;
      if (every !== undefined && ((configuredNumber(every) ?? 0) < 1)) {
        problems.push(
          `config/cron.json: "${id}".everyMinutes must be a number of minutes >= 1 ` +
            `(got ${JSON.stringify(every)}); falling back to ${JOB_DEFAULTS.everyMinutes}.`,
        );
      }
    } else if (entry !== undefined) {
      problems.push(`config/cron.json: "${id}" must be an object.`);
    }
  }

  // A job in the registry with no entry is NORMAL — it inherits the defaults,
  // exactly like a declared AI task with no binding. Not reported.
  return problems;
}
