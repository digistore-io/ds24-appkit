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
}
