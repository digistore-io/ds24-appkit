#!/usr/bin/env node
// The scheduled jobs, from the terminal.
//
//   node run.mjs cron              # run everything that is due, now
//   node run.mjs cron --list       # what exists, when it last ran, what it said
//   node run.mjs cron --job prune-ai-usage    # run one, due or not
//
// ── It calls the RUNNING APP, and that is the point ───────────────────────
// The obvious alternative is a script that connects to the database and does
// the work itself. That gives you two implementations of every job which agree
// until the day they do not, and it means triggering a job by hand proves
// nothing about the path production actually takes.
//
// So this posts to `/api/cron` on the local app. One registry, one runner, and
// a manual run exercises the authentication, the lock and the bookkeeping
// exactly as the scheduler does.
//
// For the case where the app is NOT running and you want rows gone anyway,
// `node run.mjs db-prune-ai` and `db-prune-ipn` still go straight at the
// database. They are the offline twins, and they are documented as such.
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import "../lib/env.mjs";
import { readEnvValue, setEnvValue } from "../lib/env-write.mjs";
import { describeEvery } from "../../lib/cron/rules.mjs";

const argv = process.argv.slice(2);
const wantsList = argv.includes("--list");
const jobFlag = argv.indexOf("--job");
const jobId = jobFlag >= 0 ? argv[jobFlag + 1] : null;

if (jobFlag >= 0 && !jobId) {
  console.error("ERROR: --job needs a job id. `--list` shows them.");
  process.exit(2);
}

// The port the app actually came up on. `node run.mjs start` moves to the next
// free one and remembers it here, so hard-coding 3000 would talk to whatever
// else is listening there. Same file every other dev script reads.
function appPort() {
  if (existsSync(".dev/port")) {
    const port = Number(readFileSync(".dev/port", "utf8").trim());
    if (Number.isFinite(port) && port > 0) return port;
  }
  return 3000;
}

// A secret is required by the endpoint, and a developer has no reason to think
// about one. Generated on first use exactly as AUTH_SECRET is
// (scripts/dev/ensure-env.mjs) — never overwriting a value that is already set,
// because in STAGING/PROD it belongs to the host's secret management.
function cronSecret() {
  const existing = readEnvValue(".env", "CRON_SECRET");
  if (existing) return existing;

  const generated = randomBytes(32).toString("hex");
  setEnvValue(".env", "CRON_SECRET", generated);
  console.log("→ CRON_SECRET generated in .env (local development secret).");
  console.log("  In STAGING/PROD it belongs in the host's secrets — see docs/DEPLOY.md.\n");
  // No "now restart the app" here: in dev Next.js picks a changed .env up by
  // itself, so saying it would be wrong most of the time. The 401 branch below
  // says it exactly when it is true.
  return generated;
}

function url(port) {
  const base = `http://127.0.0.1:${port}/api/cron`;
  if (wantsList) return `${base}?list`;
  if (jobId) return `${base}?job=${encodeURIComponent(jobId)}`;
  return base;
}

function ago(iso) {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const port = appPort();
const secret = cronSecret();

let response;
try {
  response = await fetch(url(port), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
} catch {
  // `fetch` rather than curl — Node has it built in and curl is not on every
  // machine (CLAUDE.md → Three systems).
  console.error(`ERROR: no app answering on http://127.0.0.1:${port}.`);
  console.error("Start it first:  node run.mjs start");
  console.error("Or, without a running app:  node run.mjs db-prune-ai --dry-run");
  process.exit(1);
}

if (response.status === 401) {
  console.error("ERROR: the app rejected the CRON_SECRET in your .env.");
  console.error("It reads its environment at start — restart it:  node run.mjs restart");
  process.exit(1);
}
if (response.status === 503) {
  console.error("ERROR: the app has no CRON_SECRET set.");
  console.error("It is in your .env now; restart the app:  node run.mjs restart");
  process.exit(1);
}
if (!response.ok && response.status !== 404) {
  console.error(`ERROR: the app answered ${response.status}.`);
  console.error("What went wrong is in the app's log:  node run.mjs logs");
  process.exit(1);
}

const body = await response.json();

if (wantsList) {
  console.log("Scheduled jobs (config/cron.json):\n");
  for (const job of body.jobs ?? []) {
    const state = job.enabled ? describeEvery(job.everyMinutes) : "OFF";
    console.log(`  ${job.job}  —  ${state}`);
    console.log(`    ${job.describe}`);
    console.log(
      `    last run: ${ago(job.lastFinishedAt)}` +
        (job.lastOutcome ? ` (${job.lastOutcome})` : "") +
        (job.lastDetail ? ` — ${job.lastDetail}` : ""),
    );
    if (job.failures > 0) {
      console.log(`    ⚠ ${job.failures} of ${job.runs} run(s) failed`);
    }
    if (job.lockedAt) console.log(`    running since ${ago(job.lockedAt)}`);
    console.log();
  }
  console.log("Run one now:  node run.mjs cron --job <id>");
  process.exit(0);
}

const results = body.results ?? [];
if (results.length === 0) {
  console.log("Nothing to do — no job is due.");
  process.exit(0);
}

let failed = 0;
for (const result of results) {
  const mark = result.outcome === "ok" ? "✓" : result.outcome === "skipped" ? "·" : "✗";
  console.log(`${mark} ${result.job}: ${result.detail}${result.ms ? ` (${result.ms}ms)` : ""}`);
  if (result.outcome === "failed") failed++;
}
// A non-zero exit so a host's scheduler notices. A cron entry whose command
// always succeeds is a cron entry nobody ever gets an alert from.
process.exit(failed > 0 ? 1 : 0);
