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

  return problems;
}
