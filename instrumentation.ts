// Runs once at server start (Next.js instrumentation hook).
//
// Purpose: enforce the environment rules from lib/env-guard.ts BEFORE the app
// accepts requests. In STAGING and PROD email delivery is mandatory — without
// it the app does not start. Better a clear abort at deploy time than a
// running app nobody can sign in to.
export async function register() {
  // Check in the Node runtime only (not in the edge runtime pass).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Import env-guard only — NOT lib/email: that depends on nodemailer, and
  // this hook is built for the edge runtime too. An import from there breaks
  // startup with "Can't resolve 'stream'".
  const { checkEnvironment, appEnv, hasEmailConfig } = await import(
    "@/lib/env-guard"
  );

  const environment = appEnv(process.env.APP_ENV);
  const problems = checkEnvironment({
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    emailConfigured: hasEmailConfig(process.env),
  });

  if (problems.length > 0) {
    console.error("\n✗ Startup aborted — the environment is not ready:\n");
    for (const p of problems) console.error(`  • ${p}\n`);
    throw new Error(
      `Environment ${environment} is not configured correctly (${problems.length} problem(s)).`,
    );
  }

  console.log(`✓ Environment: ${environment.toUpperCase()}`);

  // The scheduled jobs (docs/cron.md). AFTER the environment check, so an
  // installation that is refusing to start does not begin deleting rows on its
  // way out.
  //
  // Not during `next build`. Measured: this Next.js version does not run the
  // hook at build time at all, so today the guard changes nothing — it is here
  // because the cost of being wrong is a build machine pruning a production
  // table, possibly without even having the database. `NEXT_PHASE` is Next.js's
  // own variable and the documented way to tell the two apart.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { schedulerEnabled } = await import("@/lib/cron/config");
  if (!schedulerEnabled()) {
    console.log("• Scheduler: off (config/cron.json) — /api/cron still works");
    return;
  }
  const { startScheduler } = await import("@/lib/cron/scheduler");
  startScheduler();
}
