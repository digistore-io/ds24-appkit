#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Provisions the smoke account for a DEPLOYED app — the member `smoke` signs
// in as when `node run.mjs smoke --url https://…` runs against production.
//
// The hole it closes: against a remote URL the development login does not
// exist (lib/auth/dev-login.ts — four conditions, all deliberate), so smoke's
// signed-in second pass had nothing to sign in WITH, and every protected page
// on the live app was only ever a redirect, never rendered. The password
// sign-in (lib/auth/password-login.ts) is the real second door that exists in
// PROD — this script gives smoke a key to it.
//
// What it does, and the reasoning behind each piece:
//
//  - **Role `member`, never `owner` — a security decision, not a default.**
//    The password lands in the local `.env`; if that file ever leaks, a member
//    credential opens one empty customer account — no admin surface, no other
//    member's data (member actions are session-scoped by design), no balance.
//    The cost: admin pages stay unrendered remotely, and smoke says so.
//  - **The password is random and lives in the local `.env` only** —
//    `randomBytes(24)`, base64url. It is never a host secret: the deployed app
//    only ever verifies the HASH. Re-running this script rotates it.
//  - **No notice mail.** The row is written directly, so the account-page
//    actions that mail on credential changes never run — correct here: there
//    is no member behind this account to notify, it is the operator's tooling.
//  - **It runs LOCALLY against the production DATABASE_URL** — the same
//    procedure `user-create` uses at go-live (docs/DEPLOY.md → "Proving it
//    works"): `DATABASE_URL="postgres://…" node run.mjs smoke-account --apply`.
//    That is what puts the password into the LOCAL `.env`, where smoke reads
//    it; a run on the host would print the password into the host's log and
//    still leave the `.env` empty.
//
// Refusals (all in smokeAccountProblems(), pure and tested):
//  - `--apply` against a localhost DATABASE_URL — the smoke account is for
//    deployed apps; locally the development login already covers smoke.
//  - an existing row with role `owner` — never attach a script-held password
//    to an operator account, and never demote one.
//  - an existing row that is blocked — un-blocking from a provisioning script
//    would be a policy change wearing a tool's clothes.
//
// Usage:
//   DATABASE_URL="postgres://…prod…" node run.mjs smoke-account            # dry run
//   DATABASE_URL="postgres://…prod…" node run.mjs smoke-account --apply    # write
//   … --env staging          # provision for staging (APP_URL_STAGING, SMOKE_STAGING_*)
//   … --email smoke@my.app   # explicit address (default: smoke@<host of APP_URL_PROD>)
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, connect, requireDatabaseUrl } from "./_db.mjs";
import { setEnvValue } from "../lib/env-write.mjs";
import { hashPassword } from "../../lib/credentials/hash.mjs";

/**
 * The default smoke address: `smoke@` on the app's own domain. An own-domain
 * address makes a collision with a real customer practically impossible — it
 * is a namespacing convention, nothing about mail delivery depends on it (the
 * account never receives mail).
 *
 * @param {string | null | undefined} appUrl
 * @returns {string | null}
 */
export function defaultSmokeEmail(appUrl) {
  if (typeof appUrl !== "string" || !appUrl.trim()) return null;
  try {
    const host = new URL(appUrl.trim()).hostname.toLowerCase().replace(/\.+$/, "");
    return host ? `smoke@${host}` : null;
  } catch {
    return null;
  }
}

/**
 * Does this DATABASE_URL point at the developer's own machine?
 *
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isLocalDatabaseUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Every reason NOT to provision, as sentences that name their fix. Pure, so
 * the refusals are tested instead of hoped for. Fields about the existing row
 * are optional — before the row is read, only the environment is judged.
 *
 * @param {{
 *   databaseUrl?: string | null,
 *   email?: string | null,
 *   envName?: string,
 *   existingRole?: string | null,
 *   existingBlockedAt?: Date | string | null,
 * }} input
 * @returns {string[]} empty when nothing stands in the way
 */
export function smokeAccountProblems({
  databaseUrl,
  email,
  envName = "prod",
  existingRole = null,
  existingBlockedAt = null,
} = {}) {
  const problems = [];
  const appUrlVar = envName === "staging" ? "APP_URL_STAGING" : "APP_URL_PROD";

  if (isLocalDatabaseUrl(databaseUrl)) {
    problems.push(
      "DATABASE_URL points at this machine — the smoke account is for a DEPLOYED app; " +
        "locally, smoke signs in through the development login already. Run it with the " +
        `deployed database: DATABASE_URL="postgres://…" node run.mjs smoke-account --apply`,
    );
  }
  if (!email) {
    problems.push(
      `no address to provision — set ${appUrlVar} in the .env (the default is smoke@<its host>), ` +
        "or pass one: --email smoke@your-domain.example",
    );
  }
  if (existingRole === "owner") {
    problems.push(
      `${email} is an OWNER account — refusing to attach a smoke password to an operator. ` +
        "Pick another address: --email smoke@<your domain>",
    );
  }
  if (existingBlockedAt) {
    problems.push(
      `${email} is blocked — this script does not un-block accounts. ` +
        "Pick another address, or review the block on /dashboard/admin/users first.",
    );
  }
  return problems;
}

/**
 * A fresh smoke password: 24 random bytes, base64url — 32 chars, shell-safe,
 * ~192 bits. Nothing to remember; rotation is a re-run of this script.
 *
 * @returns {string}
 */
export function generatePassword() {
  return randomBytes(24).toString("base64url");
}

// ── main ────────────────────────────────────────────────────────────────────
// (everything below touches process/env/DB and is exercised by hand and by
// smoke itself, not by unit tests — the decisions above are the tested part)

// Same main-module test as scripts/ux/check.mjs — path-compared, so it works
// with Windows separators too, and importing the pure functions from a test
// never starts the CLI.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);

  const envName = args.env === "staging" ? "staging" : "prod";
  if (args.env && args.env !== envName) {
    console.error('ERROR: --env must be "prod" or "staging".');
    process.exit(2);
  }
  const suffix = envName === "staging" ? "STAGING" : "PROD";
  const appUrl = process.env[`APP_URL_${suffix}`];

  const email =
    typeof args.email === "string"
      ? args.email.trim().toLowerCase()
      : defaultSmokeEmail(appUrl);
  if (email && !email.includes("@")) {
    console.error('ERROR: a valid --email "<address>" is required.');
    process.exit(2);
  }

  const databaseUrl = process.env.DATABASE_URL ?? null;
  const preflight = smokeAccountProblems({ databaseUrl, email, envName });
  // The local-URL refusal gates the WRITE; a dry run may look at anything.
  const blocking = apply ? preflight : preflight.filter((p) => !p.startsWith("DATABASE_URL"));
  if (blocking.length > 0) {
    for (const p of blocking) console.error(`ERROR: ${p}`);
    process.exit(2);
  }

  if (!apply) {
    console.log("DRY RUN — the following smoke account would be provisioned:");
    console.log(
      JSON.stringify(
        {
          email,
          role: "member",
          env: envName,
          writesToEnv: [`SMOKE_${suffix}_EMAIL`, `SMOKE_${suffix}_PASSWORD`],
        },
        null,
        2,
      ),
    );
    if (isLocalDatabaseUrl(databaseUrl)) {
      console.log(
        "\nNote: DATABASE_URL currently points at this machine — --apply will refuse it.\n" +
          'Run with the deployed database: DATABASE_URL="postgres://…" node run.mjs smoke-account --apply',
      );
    }
    console.log("\nTo execute, call it again with --apply.");
    process.exit(0);
  }

  requireDatabaseUrl();
  const sql = connect();
  try {
    const [existing] = await sql`
      select role, "blockedAt" from users where email = ${email}
    `;
    const problems = smokeAccountProblems({
      databaseUrl,
      email,
      envName,
      existingRole: existing?.role ?? null,
      existingBlockedAt: existing?.blockedAt ?? null,
    });
    if (problems.length > 0) {
      for (const p of problems) console.error(`ERROR: ${p}`);
      process.exit(2);
    }

    const password = generatePassword();
    const stored = await hashPassword(password);

    // Upsert by email. The role is set on INSERT only — an existing member
    // keeps whatever it has, and the owner case was refused above.
    await sql`
      insert into users (id, email, role, "emailVerified", "passwordHash")
      values (${randomUUID()}, ${email}, 'member', now(), ${stored})
      on conflict (email) do update set "passwordHash" = excluded."passwordHash"
    `;

    setEnvValue(".env", `SMOKE_${suffix}_EMAIL`, email);
    setEnvValue(".env", `SMOKE_${suffix}_PASSWORD`, password);

    console.log(
      existing
        ? `✓ Smoke account rotated: ${email} (member) — new password written to .env`
        : `✓ Smoke account created: ${email} (member) — password written to .env`,
    );
    console.log(
      `  → SMOKE_${suffix}_EMAIL / SMOKE_${suffix}_PASSWORD in the local .env (gitignored).\n` +
        `  → Try it: node run.mjs smoke --url ${appUrl ?? "https://YOUR-DOMAIN"}\n` +
        "  → Re-running this command rotates the password.",
    );
  } catch (e) {
    console.error("ERROR while writing to the database:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
