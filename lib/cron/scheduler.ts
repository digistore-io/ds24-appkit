// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The timer that makes the whole thing work with no setup at all.
//
// ── Why in-process, when the app already had a cron ENDPOINT ──────────────
// It had one, and it only ran if the Operator wired their host's scheduler to
// it. That is a step at the end of a deploy, on a platform whose scheduler
// looks different everywhere, for a job whose failure is invisible — nothing
// breaks when nobody schedules it, the table just grows and the data stays.
// It is the single most skippable line in `docs/DEPLOY.md`, and skipping it
// costs a GDPR retention promise.
//
// So the app schedules itself, and the endpoint stays for the Operator who
// would rather their platform decide. Two paths, one registry, and the one
// that needs no decision is the default.
//
// ── What this is NOT ──────────────────────────────────────────────────────
// Not a cron parser. The schedule is an interval — "every 1440 minutes", not
// "at 03:15 on Tuesdays" — because a parser is a dependency or a bug, and no
// job here needs a wall-clock hour. Whoever does need one turns the in-app
// scheduler off and lets their host's cron call `/api/cron`, which is the tool
// that already speaks that language. `docs/cron.md` says so.
import { TICK_MINUTES } from "./rules.mjs";

let started = false;

/**
 * Start ticking. Safe to call more than once; only the first call does anything.
 *
 * Called from `instrumentation.ts`, so it runs once per server process. Two
 * processes therefore both tick — which is the case `lib/cron/run.ts` claims
 * against, and why that claim is a conditional UPDATE rather than a flag here.
 */
export function startScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      // Imported lazily and per tick. `lib/cron/run.ts` pulls in the database
      // and every job's dependencies; doing that at module load would drag them
      // into the instrumentation hook, which Next.js also builds for the edge
      // runtime. That is the same trap `instrumentation.ts` documents about
      // `lib/email`.
      const { runDueJobs } = await import("./run");
      await runDueJobs(new Date());
    } catch (error) {
      // A tick must never take the server down. A database that is briefly
      // unreachable is a normal state during a deploy, and the next tick is a
      // minute away.
      console.error("[cron] tick failed:", error);
    }
  };

  const timer = setInterval(tick, TICK_MINUTES * 60_000);
  // Node keeps a process alive for a pending timer. Without this, a container
  // told to stop would wait out the interval, and `node run.mjs stop` would
  // look like it had hung.
  timer.unref?.();

  // The first tick is delayed rather than immediate: at server start the app is
  // still opening its database pool and answering its first requests, and a
  // DELETE across a large table is the worst possible thing to do in that
  // window. Ten seconds is long enough to be out of the way and short enough
  // that a developer testing a job does not think it is broken.
  const first = setTimeout(tick, 10_000);
  first.unref?.();

  console.log(`✓ Scheduler: on, checking every ${TICK_MINUTES} min (config/cron.json)`);
}
