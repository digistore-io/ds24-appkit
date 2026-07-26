#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The command line of this app.
//
//   node run.mjs                 show every command
//   node run.mjs start           database + migrations + app
//   node run.mjs stop            stop everything
//   node run.mjs test            TypeScript check + tests
//   node run.mjs db-migrate      apply pending migrations
//   node run.mjs db-reset        wipe the database and rebuild it (local only)
//
// Arguments go straight through:
//   node run.mjs user-create --email you@example.com --role owner --apply
//   node run.mjs ds24-sync --dry-run
//   node run.mjs start --port 3005
//
// ── Why a Node script and not a Makefile ────────────────────────────────────
// This app is built with Claude Code, and Claude Code runs on Linux, macOS and
// Windows. `make` does not: it is absent on Windows and needs the Xcode Command
// Line Tools on macOS. Node is present anyway — it is a Next.js app. See
// CLAUDE.md → Three systems. (A Makefile is still in the project, but only as
// an alias that forwards here.)
//
// ── The two rules for starting other programs ───────────────────────────────
//  1. Our own scripts run through `process.execPath`, never a shell, so their
//     arguments survive verbatim.
//  2. `npm` needs `shell: true` — on Windows it is a .cmd shim, and Node has
//     refused to spawn those without a shell since 18.20/20.12.
// Both live in scripts/lib/proc.mjs; use the helpers, don't call spawn here.
import * as app from "./scripts/dev/app.mjs";
import { dbUp } from "./scripts/db/up.mjs";
import { doctor } from "./scripts/dev/doctor.mjs";
import { depsFresh, markDepsFresh } from "./scripts/dev/deps.mjs";
import { ensureEnv } from "./scripts/dev/ensure-env.mjs";
import { usesLocalPostgres } from "./scripts/db/driver.mjs";
import { localDown, localNuke } from "./scripts/db/local.mjs";
import { run, runNpm, runScript } from "./scripts/lib/proc.mjs";

// ── little helpers ──────────────────────────────────────────────────────────

/** An npm script. Ends the run with its exit code if it fails. */
async function npm(...args) {
  const code = await runNpm(["run", ...args]);
  if (code !== 0) process.exit(code);
}

/** One of our own scripts under scripts/. Ends the run with its exit code. */
async function script(file, args = []) {
  const code = await runScript(file, args);
  if (code !== 0) process.exit(code);
}

/** docker, straight through — it is a real executable on all three systems. */
async function docker(...args) {
  const code = await run("docker", args);
  if (code !== 0) process.exit(code);
}

// ── the tasks ───────────────────────────────────────────────────────────────
// `needs` are the tasks that have to run first — the same idea as a Makefile's
// prerequisites, and each of them runs at most once per invocation.

const TASKS = {
  // ── Start / Stop ──────────────────────────────────────────────────────────
  start: {
    group: "Start / Stop",
    help: "Start everything: DB + migrations + app (http://localhost:3000)",
    needs: ["env", "node_modules", "db-up", "db-migrate"],
    run: (_args, { port }) => app.start(port),
  },
  stop: {
    group: "Start / Stop",
    help: "Stop everything: tunnel + app + database",
    run: () => app.stop(),
  },
  restart: {
    group: "Start / Stop",
    help: "Restart",
    needs: ["stop"],
    // Through runTask, not TASKS.start.run: `stop` took the database down, so
    // start's own prerequisites have to run again.
    run: (args, options) => runTask("start", args, options),
  },
  status: {
    group: "Start / Stop",
    help: "Is the app running? Is the database running?",
    run: () => app.status(),
  },
  logs: {
    group: "Start / Stop",
    help: "Follow the running app's log (Ctrl-C to stop)",
    run: () => app.logs(),
  },
  dev: {
    group: "Start / Stop",
    help: "Run the app in the foreground (logs straight in the terminal)",
    needs: ["env", "node_modules", "db-up", "db-migrate"],
    run: (_args, { port }) => app.dev(port),
  },

  // ── Tests & quality ───────────────────────────────────────────────────────
  test: {
    group: "Tests & quality",
    help: "Tests (vitest) + TypeScript check",
    needs: ["node_modules"],
    run: async () => {
      await npm("typecheck");
      await npm("test");
    },
  },
  typecheck: {
    group: "Tests & quality",
    help: "TypeScript check on its own",
    needs: ["node_modules"],
    run: () => npm("typecheck"),
  },
  smoke: {
    group: "Tests & quality",
    help: 'Call every page once — finds "Internal Server Error" (the app must be running)',
    // --url explicitly: otherwise the script stubbornly checks localhost:3000 and
    // reports green while another project answers there. The user's own --url
    // wins, because the first one counts.
    run: (args, { port }) =>
      script("scripts/dev/smoke.mjs", [...args, "--url", `http://localhost:${port ?? app.appPort()}`]),
  },
  errors: {
    group: "Tests & quality",
    help: "What went wrong in the running app's log — the errors a 200 hides",
    // No `needs`: it only reads .dev/dev.log, and it has to work precisely when
    // the app has fallen over and nothing else can run.
    run: (args) => script("scripts/dev/log-errors.mjs", args),
  },
  "ai-check": {
    group: "Tests & quality",
    help: "Which task runs on which model, are the keys there, what does a call cost",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/ai/check.mjs", args),
  },
  "mcp-check": {
    group: "Tests & quality",
    help: "Check the MCP server (settings) — and with --live really call it once",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/mcp/check.mjs", args),
  },
  "legal-check": {
    group: "Tests & quality",
    help: "What is still missing legally — placeholder pages, the AI notice, consent, evidence",
    // No `needs`: most of it reads files and JSON, and it has to work in a
    // half-set-up project — which is exactly when somebody asks whether they
    // may go live. The one check that wants a database says so and skips.
    run: (args) => script("scripts/legal/check.mjs", args),
  },
  "kb-check": {
    group: "Tests & quality",
    help: "Check the assistant's handbook (content/knowledge/) — format, size, cost per answer",
    // No `needs`: it reads Markdown and prints numbers. It has to work in a
    // half-set-up project, because that is exactly when somebody is writing
    // the handbook for the first time.
    run: (args) => script("scripts/ai/kb-check.mjs", args),
  },
  lint: {
    group: "Tests & quality",
    help: "Lint",
    needs: ["node_modules"],
    run: () => npm("lint"),
  },
  build: {
    group: "Tests & quality",
    help: "Production build",
    needs: ["node_modules"],
    run: () => npm("build"),
  },

  // ── Database ──────────────────────────────────────────────────────────────
  // The golden path: change the schema in db/schema.ts → `db-generate` creates a
  // SQL migration in drizzle/ → `db-migrate` applies it. Migrations are
  // committed; in production ONLY db-migrate runs (never db:push).
  // Details: docs/database.md
  "db-up": {
    group: "Database",
    help: "Start Postgres and wait until it is ready",
    run: () => dbUp(),
  },
  "db-down": {
    group: "Database",
    help: "Stop Postgres (data is kept)",
    run: async () => ((await usesLocalPostgres()) ? localDown() : docker("compose", "down")),
  },
  "db-migrate": {
    group: "Database",
    help: "Apply pending migrations (in production too)",
    needs: ["env", "node_modules", "db-up"],
    run: () => npm("db:migrate"),
  },
  "db-generate": {
    group: "Database",
    help: "Create a migration from a schema change (db/schema.ts)",
    needs: ["node_modules"],
    run: async () => {
      await npm("db:generate");
      console.log(
        "→ Review the new file in drizzle/, commit it and apply it with 'node run.mjs db-migrate'.",
      );
    },
  },
  "db-reset": {
    group: "Database",
    help: "Wipe the database + migrations + seed (LOCAL only)",
    needs: ["env", "node_modules", "db-up"],
    run: () => npm("db:reset"),
  },
  "db-seed": {
    group: "Database",
    help: "Create test data / an admin account (scripts/db/seed.mjs)",
    needs: ["env", "node_modules", "db-up"],
    run: () => npm("db:seed"),
  },
  "db-studio": {
    group: "Database",
    help: "Inspect the database in the browser (Drizzle Studio)",
    needs: ["env", "node_modules"],
    run: () => npm("db:studio"),
  },
  "db-nuke": {
    group: "Database",
    help: "Stop everything (tunnel + app + DB) AND delete the database (all data gone)",
    // `stop` first: a running app still holds connections to the database, and
    // nuking the data out from under it leaves both in a mess.
    needs: ["stop"],
    run: async () => {
      if (await usesLocalPostgres()) await localNuke();
      else await docker("compose", "down", "-v");
      console.log("✓ Database deleted — all data gone.");
    },
  },
  // The scheduled jobs run by themselves while the app is up (docs/cron.md).
  // This is for looking at them and for running one now.
  cron: {
    group: "Database",
    help: "Scheduled jobs: run what is due, --list them, or --job <id> to force one",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/cron/run.mjs", args),
  },
  // The offline twins of two of those jobs: straight at the database, no
  // running app needed, and a --dry-run the scheduled path does not have.
  "db-prune-ipn": {
    group: "Database",
    help: "Delete IPN-log entries older than 60 days (--days 30) — without the app running",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/db/prune-ipn-log.mjs", args),
  },
  "db-prune-ai": {
    group: "Database",
    help: "Delete AI-usage rows older than 365 days (--days 90) — they are the cost history",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/db/prune-ai-usage.mjs", args),
  },

  "data-export": {
    group: "Database",
    help: 'Everything held about one person, as JSON (--email "kunde@example.de")',
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/privacy/export-data.mjs", args),
  },

  // ── Users & roles ─────────────────────────────────────────────────────────
  "user-create": {
    group: "Users & roles",
    help: "Create a user / set a role (--email … --role owner --apply)",
    run: (args) => script("scripts/users/create-user.mjs", args),
  },
  "user-list": {
    group: "Users & roles",
    help: "List users and roles (--role owner)",
    run: (args) => script("scripts/users/list-users.mjs", args),
  },

  // ── Mail delivery (sign-in) ───────────────────────────────────────────────
  "mail-setup": {
    group: "Mail delivery",
    help: "Set up email delivery (Postmark or SMTP) + a test mail",
    run: () => script("scripts/dev/mail-setup.mjs"),
  },

  // ── Digistore24 setup ─────────────────────────────────────────────────────
  "ds24-connect": {
    group: "Digistore24",
    help: "Fetch the API key (opens the browser) and store it in .env",
    run: (args) => script("scripts/ds24/connect-api-key.mjs", args),
  },
  "ds24-sync": {
    group: "Digistore24",
    help: "Create/update products + the IPN hookup (idempotent; preview: --dry-run)",
    // This one is expected to really create the products, so it passes --apply
    // by itself; the scripts themselves stay at "a dry run is the normal case".
    // Whoever only wants to look: `node run.mjs ds24-sync --dry-run`.
    run: async (args) => {
      const apply = args.includes("--dry-run") ? [] : ["--apply"];
      await script("scripts/ds24/sync-products.mjs", [...apply, ...args]);
      await script("scripts/ds24/ipn-setup.mjs", ["--auto", ...apply, ...args]);
    },
  },
  "ds24-approval": {
    group: "Digistore24",
    help: "Request product approval (go-live; reseller from language, --apply; --lang en --apply)",
    run: (args) => script("scripts/ds24/request-approval.mjs", args),
  },
  "ds24-ipn": {
    group: "Digistore24",
    help: 'Set up the IPN hookup manually (--url … --domain … --apply)',
    run: (args) => script("scripts/ds24/ipn-setup.mjs", args),
  },
  "ds24-ipn-verify": {
    group: "Digistore24",
    help: "Diagnose a failed IPN signature from the stored payload (--order ABC123)",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/ds24/ipn-verify.mjs", args),
  },
  "ds24-tunnel": {
    group: "Digistore24",
    help: "Receive IPNs locally: public address in the background + IPN registered",
    run: (args, { port }) =>
      script("scripts/ds24/tunnel.mjs", ["start", String(port ?? app.appPort()), ...args]),
  },

  // ── Setup helpers ─────────────────────────────────────────────────────────
  doctor: {
    group: "Setup",
    help: "What has to be installed — and what is missing on this machine (--json, --deploy)",
    run: (args) => doctor(args),
  },
  setup: {
    group: "Setup",
    help: "Get this project ready to work in: .env, dependencies, database, migrations",
    // The same prerequisites as `start`, without starting the app. One command
    // for the whole preparation, so the setup-machine skill calls one and not
    // five — and so a person has a single thing to type after a fresh clone.
    needs: ["env", "node_modules", "db-up", "db-migrate"],
    run: () => console.log("\n✓ Ready. Start it with: node run.mjs start"),
  },
  env: {
    group: "Setup",
    help: "Ensure .env exists (create it + generate AUTH_SECRET)",
    run: () => ensureEnv(),
  },
  update: {
    group: "Setup",
    help: "Bring the guidance up to date (CLAUDE.md, docs/, skills) — --apply writes",
    run: (args) => script("scripts/dev/update.mjs", args),
  },
  help: {
    group: "Setup",
    help: "Show this overview",
    run: () => showHelp(),
  },

  // Runs when something needs it, never listed.
  node_modules: {
    hidden: true,
    run: async () => {
      if (depsFresh()) return;
      const code = await runNpm(["install"]);
      if (code !== 0) process.exit(code);
      markDepsFresh();
    },
  },
};

// ── help ────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log("Commands for this app — node run.mjs <command> [arguments]\n");
  const groups = new Map();
  for (const [name, task] of Object.entries(TASKS)) {
    if (task.hidden) continue;
    if (!groups.has(task.group)) groups.set(task.group, []);
    groups.get(task.group).push([name, task.help]);
  }
  for (const [group, entries] of groups) {
    console.log(`${group}:`);
    for (const [name, help] of entries) console.log(`  ${name.padEnd(18)} ${help}`);
    console.log("");
  }
  console.log("The npm scripts behind them (npm run dev, npm run db:migrate, …) keep working.");
}

// ── the runner ──────────────────────────────────────────────────────────────

/** Pull `--port 3005` out of the arguments; PORT=3005 in the environment also counts. */
function takePort(args) {
  const index = args.indexOf("--port");
  if (index !== -1 && args[index + 1]) {
    const port = Number(args.splice(index, 2)[1]);
    if (Number.isFinite(port)) return port;
  }
  const fromEnv = Number(process.env.PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : undefined;
}

const done = new Set();

async function runTask(name, args, options) {
  const task = TASKS[name];
  for (const need of task.needs ?? []) {
    if (done.has(need)) continue;
    done.add(need);
    await runTask(need, [], options);
  }
  await task.run(args, options);
}

const argv = process.argv.slice(2);
const command = argv.shift() ?? "help";

if (!Object.hasOwn(TASKS, command) || TASKS[command].hidden) {
  console.error(`✗ Unknown command: ${command}\n`);
  showHelp();
  process.exit(2);
}

// takePort removes the flag from argv, so the rest passes through untouched.
const options = { port: takePort(argv) };

try {
  await runTask(command, argv, options);
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
