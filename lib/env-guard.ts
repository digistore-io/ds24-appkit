// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Environment rules: DEV / STAGING / PROD.
//
// This template knows three environments (see docs/environments.md). They
// differ in more than name — hard rules hang off them:
//
//   DEV      local. Mail sending optional; as long as none is set up, the
//            development login exists (sign-in without a magic link).
//   STAGING  real domain, real user testing. Mail sending is MANDATORY,
//            the development login is ruled out.
//   PROD     real money, real customers. Mail sending is MANDATORY,
//            the development login is ruled out.
//
// The development login is an auth bypass (lib/auth/dev-login.ts). So that a
// forgotten env flag cannot let it slip into a real environment, this file
// checks the environment at server start (instrumentation.ts) and aborts
// instead of carrying on unsafely.

export type AppEnv = "development" | "staging" | "production";

// --- Detecting the mail transport ----------------------------------------
// Deliberately here and not in lib/email.ts: these checks only read env values
// and pull in no dependencies. lib/email.ts depends on nodemailer — if
// instrumentation.ts imported from there, nodemailer would end up in the edge
// bundle and the app would stop starting ("Can't resolve 'stream'").

export interface MailEnv {
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_SENDER?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  // Index signature so process.env can be passed in directly.
  [key: string]: string | undefined;
}

export function hasPostmarkConfig(env: MailEnv): boolean {
  return Boolean(env.POSTMARK_SERVER_TOKEN && env.POSTMARK_SENDER);
}

export function hasSmtpConfig(env: MailEnv): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

/** true if at least one transport is fully configured. */
export function hasEmailConfig(env: MailEnv): boolean {
  return hasPostmarkConfig(env) || hasSmtpConfig(env);
}

export interface EnvCheckInput {
  APP_ENV?: string;
  NODE_ENV?: string;
  AUTH_SECRET?: string;
  emailConfigured: boolean;
  /**
   * Which media driver this machine is set to, and whether its bucket is
   * configured. See `mediaProblem()` below for why this is a start condition
   * rather than a warning.
   */
  MEDIA_DRIVER?: string;
  mediaBucketConfigured?: boolean;
}

/**
 * Normalizes APP_ENV. Unknown values count as "production" — when in doubt the
 * strictest environment, not the loosest.
 */
export function appEnv(value?: string): AppEnv {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "" || v === "development" || v === "dev" || v === "local") {
    return "development";
  }
  if (v === "staging" || v === "test") return "staging";
  return "production";
}

/** true for environments real users see (STAGING and PROD). */
export function isRealEnvironment(value?: string): boolean {
  return appEnv(value) !== "development";
}

/**
 * Checks the environment and returns the list of violations (empty = fine).
 * A pure function, so it can be tested on its own in lib/env-guard.test.ts.
 */
export function checkEnvironment(env: EnvCheckInput): string[] {
  const problems: string[] = [];
  const environment = appEnv(env.APP_ENV);

  if (environment === "development") return problems;

  // From here on: STAGING or PROD.
  if (!env.emailConfigured) {
    problems.push(
      `APP_ENV=${environment}: No email delivery is configured. ` +
        "In STAGING and PROD it is mandatory — without it nobody could sign " +
        "in, and the development login is deliberately unavailable there. " +
        "Set up Postmark (POSTMARK_SERVER_TOKEN + POSTMARK_SENDER) " +
        "or SMTP (SMTP_HOST + SMTP_USER + SMTP_PASSWORD).",
    );
  }

  if (!env.AUTH_SECRET) {
    problems.push(
      `APP_ENV=${environment}: AUTH_SECRET is missing. Without a secret, ` +
        "sessions cannot be signed securely. Generate one with:\n" +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }

  const media = mediaProblem(environment, env);
  if (media) problems.push(media);

  return problems;
}

/**
 * Media on a real environment: object storage, or the app does not start.
 *
 * ── Why this is a refusal and not a warning ────────────────────────────────
 * `MEDIA_DRIVER=local` writes files to the machine's own disk. On one node that
 * works perfectly, which is exactly the problem: the failure it produces
 * appears only AFTER success. The first redeploy loses everything stored so
 * far. The second node makes an upload land on one disk and the next request be
 * answered by the other, so a file is there about half the time — which reaches
 * the operator as "customers say pictures disappear sometimes" and cannot be
 * reproduced on the machine anybody tests on.
 *
 * A warning is the wrong instrument for a fault that is invisible until it is
 * expensive. So this is the same shape as the mail rule above: STAGING and PROD
 * do not start without somewhere real to put things.
 *
 * ── Why an unconfigured bucket counts too ──────────────────────────────────
 * `MEDIA_DRIVER=s3` with no endpoint or no credentials is not "media off", it
 * is an app that accepts uploads and fails at the moment it tries to store one
 * — after the customer has waited for their file to travel. Failing at start is
 * the honest version, and `setup-hosting` books the bucket alongside the
 * database so that reaching this message is unusual.
 */
export function mediaProblem(
  environment: AppEnv,
  env: { MEDIA_DRIVER?: string; mediaBucketConfigured?: boolean },
): string | null {
  if (environment === "development") return null;

  const driver = (env.MEDIA_DRIVER ?? "").trim().toLowerCase();

  if (driver === "" || driver === "local") {
    return (
      `APP_ENV=${environment}: MEDIA_DRIVER is "${driver || "unset"}", which ` +
      "stores uploaded files on this machine's own disk. That is a development " +
      "convenience and not storage: the next redeploy loses every file, and a " +
      "second instance cannot see what the first one wrote — so a customer's " +
      "picture is there roughly half the time, and nobody can reproduce it. " +
      "Set MEDIA_DRIVER=s3 and point it at a bucket (Amazon S3, DigitalOcean " +
      "Spaces, Cloudflare R2, Backblaze B2, Hetzner Object Storage — any of " +
      "them). The skill `setup-hosting` books one; `node run.mjs media-check` " +
      "verifies it."
    );
  }

  if (driver !== "s3") {
    return (
      `APP_ENV=${environment}: MEDIA_DRIVER="${driver}" is not a driver. ` +
      'Use "s3". See docs/visuals.md.'
    );
  }

  if (env.mediaBucketConfigured === false) {
    return (
      `APP_ENV=${environment}: MEDIA_DRIVER=s3, but the bucket is not ` +
      "configured. Needs MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, " +
      "MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY. Without them an " +
      "upload fails after the customer has already waited for it to travel. " +
      "Check with: node run.mjs media-check"
    );
  }

  return null;
}
