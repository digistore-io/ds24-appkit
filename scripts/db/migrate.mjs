#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Applies the pending migrations from drizzle/ to the database in DATABASE_URL.
//
// Usage:  npm run db:migrate      (or: node run.mjs db-migrate)
//
// WHY THIS IS NOT `drizzle-kit migrate`. It used to be, and it works on a
// developer machine — where `node_modules` holds everything. It stops working
// at the one moment it matters most: the first deploy. `drizzle-kit` is a
// devDependency, and the hosts this template targets throw those away between
// the build and the running container (Fly's generated Dockerfile runs
// `npm prune --omit=dev`, Railway and Render build the same way). The command
// this project's own DEPLOY.md tells you to run in production would then answer
// `drizzle-kit: not found` — and the app comes up against a database with no
// tables in it.
//
// The migrator underneath is the same one drizzle-kit calls, and it lives in
// `drizzle-orm`, which IS a runtime dependency: same journal table
// (`drizzle.__drizzle_migrations`), same hashes, same files. So this is not a
// second way to migrate — it is the same way, reachable from a production
// image. A database migrated by either can be migrated by the other.
//
// It stays deliberately dumb: no schema comparison, no generation, no push. It
// reads drizzle/ and applies what has not run yet. Creating migrations remains
// `node run.mjs db-generate` (drizzle-kit, developer machine, never here).
import "../lib/env.mjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "ERROR: DATABASE_URL is not set.\n" +
      "  Locally it comes from .env (node run.mjs setup writes one).\n" +
      "  At a host it is the connection string of the managed Postgres —\n" +
      "  see docs/DEPLOY.md.",
  );
  process.exit(2);
}

// `max: 1` because a migration is a sequence, not a workload: several
// connections would let two statements of the same migration land in different
// sessions. It is also the polite thing to do against a small managed Postgres,
// where the pool this app normally opens (10) may be a noticeable share of the
// plan's connection limit while a release command runs alongside the old
// version of the app.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const target = (() => {
    try {
      const { hostname, pathname } = new URL(url);
      return `${hostname}${pathname}`;
    } catch {
      return "(unreadable DATABASE_URL)";
    }
  })();
  console.log(`>> Migrating ${target}`);
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  console.log("✓ Database is up to date.");
} catch (error) {
  // The message matters more than the stack here: this runs in a deploy log
  // that somebody reads once, in a hurry, without the repository in front of
  // them.
  console.error(`✗ Migration failed: ${error.message}`);
  process.exit(1);
} finally {
  await sql.end();
}
