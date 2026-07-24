#!/usr/bin/env node
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
import { existsSync, statSync, utimesSync } from "node:fs";
import * as app from "./scripts/dev/app.mjs";
import { dbUp } from "./scripts/db/up.mjs";
import { ensureEnv } from "./scripts/dev/ensure-env.mjs";
import { capture, hasCommand, isWindows, run, runNpm, runScript } from "./scripts/lib/proc.mjs";

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
    help: "Start Postgres (Docker) and wait until it is ready",
    run: () => dbUp(),
  },
  "db-down": {
    group: "Database",
    help: "Stop Postgres (data is kept)",
    run: () => docker("compose", "down"),
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
    help: "Stop everything (tunnel + app + DB) AND delete the Docker volume (all data gone)",
    // `stop` first: a running app still holds connections to the database, and
    // nuking the volume out from under it leaves both in a mess.
    needs: ["stop"],
    run: async () => {
      await docker("compose", "down", "-v");
      console.log("✓ Database volume deleted — all data gone.");
    },
  },
  "db-prune-ipn": {
    group: "Database",
    help: "Delete IPN-log entries older than 60 days (--days 30)",
    needs: ["env", "node_modules"],
    run: (args) => script("scripts/db/prune-ipn-log.mjs", args),
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
    help: "What has to be installed — and what is missing on this machine",
    run: () => doctor(),
  },
  env: {
    group: "Setup",
    help: "Ensure .env exists (create it + generate AUTH_SECRET)",
    run: () => ensureEnv(),
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
      // The Makefile expressed this as a file target: node_modules is stale when
      // package-lock.json is newer. Same rule, spelled out.
      const fresh =
        existsSync("node_modules") &&
        existsSync("package-lock.json") &&
        statSync("node_modules").mtimeMs >= statSync("package-lock.json").mtimeMs;
      if (fresh) return;
      const code = await runNpm(["install"]);
      if (code !== 0) process.exit(code);
      const now = new Date();
      utimesSync("node_modules", now, now);
    },
  },
};

// ── doctor ──────────────────────────────────────────────────────────────────

const INSTALL_HINTS = {
  node: {
    linux: "your package manager, or https://nodejs.org",
    darwin: "brew install node",
    win32: "winget install OpenJS.NodeJS",
  },
  git: {
    linux: "your package manager",
    darwin: "xcode-select --install",
    win32: "winget install Git.Git  (Claude Code needs it anyway)",
  },
  docker: {
    linux: "https://docs.docker.com/engine/install/",
    darwin: "https://www.docker.com/products/docker-desktop/",
    win32: "https://www.docker.com/products/docker-desktop/  (uses WSL2)",
  },
  cloudflared: {
    linux: "https://pkg.cloudflare.com/  (cloudflared package)",
    darwin: "brew install cloudflared",
    win32: "winget install --id Cloudflare.cloudflared",
  },
};

const hint = (tool) => INSTALL_HINTS[tool][process.platform] ?? INSTALL_HINTS[tool].linux;

async function doctor() {
  console.log(`This machine: ${process.platform} ${process.arch}, Node ${process.version}\n`);
  let missing = 0;
  // The install hint is only interesting when the thing is missing.
  const report = (ok, label, detail) => {
    console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
    if (!ok) missing++;
  };

  const major = Number(process.versions.node.split(".")[0]);
  report(major >= 20, `Node.js ${process.version}`, major >= 20 ? "" : `needs 20 or newer: ${hint("node")}`);
  report(await hasCommand("npm"), "npm", "comes with Node.js");
  report(await hasCommand("git"), "git", hint("git"));

  const dockerThere = await hasCommand("docker");
  if (!dockerThere) {
    report(false, "Docker", hint("docker"));
  } else {
    // Installed is not the same as running — ask the daemon, don't assume.
    const info = await capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
    report(info.code === 0, "Docker", info.code === 0 ? "" : "installed, but not running — start Docker Desktop");
    const compose = await capture("docker", ["compose", "version"]);
    report(compose.code === 0, "Docker Compose v2", compose.code === 0 ? "" : "update Docker");
  }

  // Optional — only needed to receive Digistore24 IPNs on this machine.
  const tunnel = await hasCommand("cloudflared");
  console.log(
    `  ${tunnel ? "✓" : "·"} cloudflared (optional, only for local IPNs)${tunnel ? "" : ` — ${hint("cloudflared")}`}`,
  );

  if (isWindows) {
    console.log("\n  On Windows the commands belong in Git Bash or WSL2, not in PowerShell.");
  }
  console.log(
    missing === 0
      ? "\n✓ Everything that is needed is there. Next: node run.mjs start"
      : `\n✗ ${missing} thing(s) missing — install them, then run doctor again.`,
  );
  if (missing > 0) process.exit(1);
}

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
