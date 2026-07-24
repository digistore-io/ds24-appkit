#!/usr/bin/env node
// Resets the local development database: drop the schema → replay all
// migrations from drizzle/ → seed (if one exists).
//
// Usage:  npm run db:reset      (or: node run.mjs db-reset)
//
// SAFETY: this script DELETES ALL DATA. It refuses to run if the database does
// not look local or if APP_ENV=production. --force overrides that — please
// only if you are sure.
import { execFileSync } from "node:child_process";
import "../lib/env.mjs";
import { existsSync } from "node:fs";
import postgres from "postgres";

const force = process.argv.includes("--force");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "ERROR: DATABASE_URL is not set (see .env / .env.example).",
  );
  process.exit(2);
}

// Only reset local databases. Anything else could hold customer data.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "db", "postgres"];
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const isLocal = LOCAL_HOSTS.includes(host);
const isProd = process.env.APP_ENV === "production";

if ((!isLocal || isProd) && !force) {
  console.error(
    `ABORTED: db:reset deletes ALL data, and this database does not look local.\n` +
      `  Host:    ${host || "(unknown)"}\n` +
      `  APP_ENV: ${process.env.APP_ENV ?? "(not set)"}\n\n` +
      `There is no reset in production — the rule there is: npm run db:migrate.\n` +
      `If you really want it: npm run db:reset -- --force`,
  );
  process.exit(2);
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

console.log(`>> Dropping and recreating schemas (${host})`);
const sql = postgres(url, { max: 1 });
try {
  // 'public' = the tables of the app.
  await sql.unsafe("drop schema if exists public cascade");
  // 'drizzle' = the migration journal (__drizzle_migrations). It has to go as
  // well — otherwise Drizzle considers every migration already applied and
  // creates not a single table in the empty database.
  await sql.unsafe("drop schema if exists drizzle cascade");
  await sql.unsafe("create schema public");
} catch (e) {
  console.error("ERROR while resetting the schema:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}

console.log(">> Applying migrations (drizzle/)");
run("npx", ["drizzle-kit", "migrate"]);

if (existsSync("scripts/db/seed.mjs")) {
  console.log(">> Applying seed (scripts/db/seed.mjs)");
  run("node", ["scripts/db/seed.mjs"]);
}

console.log("✓ Database has been rebuilt from scratch.");
