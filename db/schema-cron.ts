// One row per scheduled job. The app's own memory of what it has run.
//
// ── Why a table rather than a timer and a hope ─────────────────────────────
// Three things need answering that a `setInterval` cannot answer on its own:
//
//  1. **When did this last run?** A restart must not re-trigger a daily job,
//     and an app that redeploys six times a day would otherwise prune six
//     times a day. The schedule lives in the database, so it survives the
//     process.
//  2. **Is another instance already running it?** Two app containers behind a
//     load balancer both hold a timer. `lockedAt` is claimed by a conditional
//     UPDATE, so exactly one of them wins — see `lib/cron/run.ts`.
//  3. **Is the scheduler running at all?** This is the failure nobody notices:
//     a cleanup that silently stopped looks exactly like a cleanup with
//     nothing to do. `node run.mjs cron --list` reads this table, so "last run
//     three weeks ago" is a thing an Operator can see rather than deduce.
//
// ── It holds no personal data ─────────────────────────────────────────────
// `lastDetail` is written by the job and is a COUNT and a window ("412 rows
// older than 12 months"), never a row, an address or anything a member typed.
// Jobs are written that way deliberately; `docs/cron.md` says so where whoever
// adds one will read it.
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const cronRuns = pgTable("cron_runs", {
  // The job id from `lib/cron/jobs.mjs`, and the primary key: one row per job,
  // for ever, updated in place. Not a history — a job that runs daily for
  // three years would otherwise be a thousand rows nobody reads, and what an
  // Operator actually asks is "did it run" and "did it work".
  job: text("job").primaryKey(),

  // Claimed before the work starts, cleared when it ends. NOT NULL means "a
  // run is in flight" — or that a process died holding it, which is why
  // `lib/cron/rules.mjs` treats a lock older than the stale window as free.
  // Without that, one crash would stop a job for ever.
  lockedAt: timestamp("locked_at"),

  lastStartedAt: timestamp("last_started_at"),
  // Set on success AND on failure — it is what the schedule is measured from.
  // Measuring from the START instead would let a job that takes longer than
  // its interval queue up behind itself.
  lastFinishedAt: timestamp("last_finished_at"),

  // "ok" | "failed". A plain string rather than an enum for the same reason
  // `ai_usage.task` is one: a customer adding a job must not need a migration.
  lastOutcome: text("last_outcome"),
  // What the job reported, in one line. Numbers, never content.
  lastDetail: text("last_detail"),

  runs: integer("runs").notNull().default(0),
  // Counted separately rather than derived, because the interesting question
  // is "has this been failing quietly", and the last outcome alone cannot say.
  failures: integer("failures").notNull().default(0),
});
