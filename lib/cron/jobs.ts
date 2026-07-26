// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The registry of scheduled jobs. Adding one is adding an entry here.
//
// ── Why jobs are TypeScript and run INSIDE the app ────────────────────────
// The scheduling rules are `.mjs` (`rules.mjs`) so the check command can print
// a schedule without a database. The job BODIES are not, and deliberately: the
// second job anybody writes needs `lib/email.ts`, or `hasPlan()`, or the token
// ledger. A registry that could only run raw SQL would be a registry nobody
// could use for the thing they actually wanted.
//
// So a job runs where the app runs, and `node run.mjs cron` asks the running
// app to run one rather than reimplementing it. There is exactly one copy of
// every job, and triggering it by hand exercises the same path the scheduler
// takes — which is the only way a manual test proves anything.
//
// ── The four rules for a job ──────────────────────────────────────────────
//
//  1. **It must be safe to run twice.** The scheduler tries hard not to, and a
//     redeploy at the wrong moment, a stale lock or an Operator pressing the
//     button will still get you a second run. Deleting rows older than a
//     cutoff is idempotent; sending a mail is not, unless the job records that
//     it sent one.
//  2. **It returns one line of NUMBERS.** That line is stored in `cron_runs`
//     and read by whoever asks whether the job is working. No address, no
//     member id, no text anybody typed — `cron_runs` must stay a table with no
//     privacy question attached (`docs/data-protection.md` §11).
//  3. **It throws on failure.** The runner records the outcome and the next
//     tick tries again. Swallowing an error makes a broken job look like a
//     healthy one, which is the failure mode this whole mechanism exists to
//     make visible.
//  4. **It finishes in well under an hour.** That is the stale-lock window
//     (`rules.mjs`), and a job still running when its lock goes stale can be
//     started a second time beside itself.
import { inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { pruneIpnEvents, IPN_LOG_RETENTION_DAYS } from "@/lib/digistore/ipn-log";

import { configuredNumber, retentionCutoff } from "./rules.mjs";
import { JOB_IDS } from "./ids.mjs";

export interface CronContext {
  /** The clock the whole tick reasons about — never `new Date()` inside a job. */
  now: Date;
  /** This job's entry from `config/cron.json`, over the defaults. */
  settings: Record<string, unknown>;
}

export interface CronJob {
  id: string;
  /** One line for `node run.mjs cron --list`. Not translated — Operator tooling. */
  describe: string;
  /** Returns one line of numbers for `cron_runs.lastDetail`. Throws on failure. */
  run(ctx: CronContext): Promise<string>;
}

/** How long AI-usage rows are kept when the config says nothing. */
export const AI_USAGE_RETENTION_MONTHS = 12;

/**
 * How long the record of who signed in as whom is kept when the config says
 * nothing. The same twelve months, and for the same reason it is written down
 * rather than inlined: it is the number `docs/data-protection.md` quotes.
 */
export const IMPERSONATION_RETENTION_MONTHS = 12;

// Both go through `configuredNumber`, NOT `Number()`. `Number(null)` is 0, and
// zero retention means delete everything — see the warning in rules.mjs.
function months(settings: Record<string, unknown>, fallback: number): number {
  const raw = configuredNumber(settings.retentionMonths);
  return raw !== null && raw >= 0 ? Math.floor(raw) : fallback;
}

function days(settings: Record<string, unknown>, fallback: number): number {
  const raw = configuredNumber(settings.retentionDays);
  return raw !== null && raw >= 0 ? Math.floor(raw) : fallback;
}

/** Rows per DELETE. Big enough to be efficient, small enough to hold in memory. */
const PRUNE_BATCH = 10_000;
/** How long one prune may spend before it leaves the rest to the next run. */
const PRUNE_BUDGET_MS = 60_000;

/**
 * Delete old rows in bounded batches, within a time budget.
 *
 * ── Why not one DELETE ────────────────────────────────────────────────────
 * `delete … where created_at < cutoff` is the obvious version and it has two
 * problems that only appear on the installation that needs it most — the app
 * that has been running for three years and is pruning for the first time:
 *
 *  1. **Memory.** `returning({ id })` on a million-row delete brings a million
 *     ids back to count them. The count is the only thing anybody wants.
 *  2. **The lock.** A delete that takes longer than the stale-lock window
 *     (an hour) lets a second instance start the same job beside it, and it
 *     holds a lock on the table the app is still writing to the whole time.
 *
 * Batching fixes the first, the budget fixes the second, and together they turn
 * "one enormous run that might not finish" into "a bounded amount of work every
 * day until it has caught up". The steady state — a daily run on a table that
 * was pruned yesterday — is one batch that finds nothing and stops.
 */
export async function pruneInBatches(
  cutoff: Date,
  budgetMs = PRUNE_BUDGET_MS,
): Promise<{ deleted: number; stoppedEarly: boolean }> {
  const startedAt = Date.now();
  let deleted = 0;

  for (;;) {
    // `id in (select … limit n)` rather than a bare `limit` on the DELETE:
    // Postgres has no LIMIT on DELETE, and the subquery is served straight off
    // `ai_usage_created`.
    const batch = await db
      .delete(aiUsage)
      .where(
        inArray(
          aiUsage.id,
          db
            .select({ id: aiUsage.id })
            .from(aiUsage)
            .where(lt(aiUsage.createdAt, cutoff))
            .limit(PRUNE_BATCH),
        ),
      )
      .returning({ id: aiUsage.id });

    deleted += batch.length;
    // A short batch means the last one — there is nothing left to find.
    if (batch.length < PRUNE_BATCH) return { deleted, stoppedEarly: false };
    // Out of budget. Note that this does NOT prove rows remain: the final batch
    // can be exactly full. So the flag is "I stopped early", not "there is
    // more", and the message says only what is true.
    if (Date.now() - startedAt >= budgetMs) return { deleted, stoppedEarly: true };
  }
}

export const CRON_JOBS: readonly CronJob[] = Object.freeze([
  {
    id: "prune-ai-usage",
    describe: "Delete AI-usage rows older than the retention window (default 12 months).",
    async run({ now, settings }) {
      const retentionMonths = months(settings, AI_USAGE_RETENTION_MONTHS);
      const cutoff = retentionCutoff(retentionMonths, now);
      // `retentionCutoff` returns null only for a value that got past
      // `months()`, which cannot happen — but a null here would delete the
      // whole table, so it refuses rather than trusting the chain.
      if (!cutoff) throw new Error(`invalid retentionMonths: ${settings.retentionMonths}`);

      // ⚠️ This deletes COST HISTORY. The AI-costs page can only report what is
      // in this table, so a pruned period reads as zero rather than as unknown.
      // That is the trade the retention window is: a year of "what did AI cost
      // me last November", and no more. `docs/ai-providers.md` says so where
      // the Operator sets the number.
      const { deleted, stoppedEarly } = await pruneInBatches(cutoff);

      return (
        `${deleted} row(s) older than ${retentionMonths} month(s) deleted` +
        // Never silently partial. A run that stopped at its budget looks
        // identical to one that finished, and an Operator reading "10,000
        // deleted" every day for a week would have no way to tell that it is
        // not keeping up.
        (stoppedEarly ? " — stopped at the time budget, the next run continues" : "")
      );
    },
  },
  {
    id: "prune-ipn-log",
    describe: "Delete IPN-log rows older than the retention window (default 60 days).",
    async run({ now, settings }) {
      const retentionDays = days(settings, IPN_LOG_RETENTION_DAYS);
      const deleted = await pruneIpnEvents(now, retentionDays);
      return `${deleted} row(s) older than ${retentionDays} day(s) deleted`;
    },
  },
  {
    id: "close-impersonations",
    describe: "Close impersonation records whose 30 minutes ran out and that nobody ended.",
    // The one ending no request can observe. Stepping out, signing out and
    // noticing the expiry on a live request all have a moment to write the end
    // — closing the tab does not. Nothing ever comes back to that session, so
    // without this job those rows stay open for ever and the record becomes
    // unreadable within a week: a finished session and a running one look
    // identical.
    //
    // Idempotent by construction — the UPDATE excludes rows that already have
    // an end, so a second run finds nothing. That is rule 1 for a job here, and
    // this one satisfies it without needing to remember anything.
    async run() {
      const { closeAbandonedImpersonations } = await import(
        "@/lib/impersonation/manage"
      );
      const closed = await closeAbandonedImpersonations();
      // Numbers only (rule 2). Naming the member or the Operator here would put
      // "who was in whose account" into `cron_runs`, which is a table with no
      // privacy question attached and must stay one. The record itself is where
      // that belongs, and it is covered by data-protection.
      return `${closed} abandoned session(s) closed`;
    },
  },
  {
    id: "prune-impersonations",
    describe: "Delete impersonation records older than the retention window (default 12 months).",
    async run({ settings }) {
      const retentionMonths = months(settings, IMPERSONATION_RETENTION_MONTHS);
      // ⚠️ This deletes the answer to "did somebody go into my account last
      // spring". Twelve months matches what this template already keeps AI
      // usage for; a shorter window weakens a member's own subject access
      // request, and that is the trade being made here rather than a default
      // nobody thought about.
      const { pruneImpersonations } = await import("@/lib/impersonation/manage");
      const deleted = await pruneImpersonations(retentionMonths);
      return `${deleted} row(s) older than ${retentionMonths} month(s) deleted`;
    },
  },
]);

export function jobById(id: string): CronJob | undefined {
  return CRON_JOBS.find((job) => job.id === id);
}

// Re-exported so a caller that already has the registry does not need two
// imports. `rules.test.ts` asserts the two lists agree.
export { JOB_IDS };
