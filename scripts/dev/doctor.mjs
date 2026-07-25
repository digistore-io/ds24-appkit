// What this machine needs, what it has, and what to do about the difference.
//
// This file is the ONE place that knows how a missing tool is installed on
// Linux, macOS and Windows. Everything else reads it:
//
//   node run.mjs doctor          the text a person reads
//   node run.mjs doctor --json   the same facts for the agent (skill setup-machine)
//   .claude/hooks/session-start  the cheap subset, on every session
//
// Why data and not prose: the skill that walks somebody through the setup must
// not carry install commands of its own. Three copies of the same table — one
// per system — drift, and the copy that drifts is always the one for the system
// nobody here runs. So the skill reads `fix[platform]` and says what it finds;
// `scripts/setup.test.ts` holds it to that.
//
// A check is one object:
//
//   { id, label, severity, ok, detail, fix }
//
//   severity  "blocker"  nothing works without it
//             "optional" nice to have (Docker, cloudflared) — Docker counts as
//                        optional because a machine without it runs the
//                        database from an npm package instead, by itself
//                        (scripts/db/driver.mjs)
//             "info"     worth knowing, never a reason to stop
//   fix       per platform: { command?, url?, admin?, gui?, restart?, note? }
//             admin   needs sudo/Administrator — the agent cannot answer that prompt
//             gui     an installer with a window — a person has to click
//             restart the machine has to be restarted afterwards
//
// Those three flags are the whole point of the shape: they are what decides
// whether the agent may run the command itself or has to hand it over, and that
// decision is a fact about the command, not a judgement to be re-made in prose.
import { existsSync } from "node:fs";
import { readEnvValue } from "../lib/env-write.mjs";
import { capture, hasCommand, isWindows } from "../lib/proc.mjs";
import { configuredDriver, dbDriver } from "../db/driver.mjs";
import { depsFresh } from "./deps.mjs";
import { portInUse, urlPort } from "./ports.mjs";

export const PLATFORMS = ["linux", "darwin", "win32"];

const MIN_NODE = 20;
const DEFAULT_DB_PORT = 15432; // as in docker-compose.yml

/** The same instruction on all three systems — used for project state, not tools. */
const everywhere = (fix) => Object.fromEntries(PLATFORMS.map((p) => [p, fix]));

/** `node run.mjs setup` fixes everything that is about this project, not the machine. */
const RUN_SETUP = everywhere({ command: "node run.mjs setup" });

// ── how a missing tool is installed ─────────────────────────────────────────
// The Linux entries are the conservative fallback; `inspect()` upgrades them to
// a concrete command once it knows which package manager is present.

export const FIXES = {
  node: {
    linux: { url: "https://nodejs.org", note: "distribution packages are often older than 20" },
    darwin: { command: "brew install node" },
    win32: { command: "winget install OpenJS.NodeJS" },
  },
  git: {
    linux: { url: "https://git-scm.com/downloads", admin: true },
    darwin: { command: "xcode-select --install", gui: true },
    win32: { command: "winget install Git.Git", note: "Claude Code needs it here anyway" },
  },
  docker: {
    linux: { url: "https://docs.docker.com/engine/install/", admin: true },
    darwin: { command: "brew install --cask docker", gui: true, note: "start Docker Desktop once afterwards" },
    win32: { command: "winget install Docker.DockerDesktop", gui: true, restart: true, note: "uses WSL2" },
  },
  cloudflared: {
    linux: { url: "https://pkg.cloudflare.com/", admin: true },
    darwin: { command: "brew install cloudflared" },
    win32: { command: "winget install --id Cloudflare.cloudflared" },
  },
  shell: {
    linux: { note: "nothing to do — any shell works here" },
    darwin: { note: "nothing to do — any shell works here" },
    win32: { note: "open Git Bash (it comes with Git for Windows) or a WSL2 shell, and run the commands there" },
  },
};

/** Which package manager this Linux has — so the fix can be a command, not a link. */
const LINUX_PACKAGES = [
  { manager: "apt-get", install: (pkgs) => `sudo apt-get install -y ${pkgs.apt}` },
  { manager: "dnf", install: (pkgs) => `sudo dnf install -y ${pkgs.dnf}` },
  { manager: "pacman", install: (pkgs) => `sudo pacman -S --noconfirm ${pkgs.pacman}` },
];

const LINUX_PACKAGE_NAMES = {
  git: { apt: "git", dnf: "git", pacman: "git" },
  docker: { apt: "docker.io docker-compose-v2", dnf: "docker docker-compose", pacman: "docker docker-compose" },
};

/**
 * A concrete Linux command for `id`, if we can name one.
 * Node is deliberately absent: the distribution packages are regularly older
 * than 20, and installing one would replace the problem with a quieter one.
 */
async function linuxFix(id) {
  const names = LINUX_PACKAGE_NAMES[id];
  if (!names) return null;
  for (const pm of LINUX_PACKAGES) {
    if (!(await hasCommand(pm.manager, ["--version"]))) continue;
    const note =
      id === "docker"
        ? "afterwards: sudo usermod -aG docker $USER — then log out and back in once"
        : undefined;
    return { command: pm.install(names), admin: true, note };
  }
  return null;
}

// ── the checks ──────────────────────────────────────────────────────────────

/**
 * Look at this machine.
 *
 * `quick` leaves out everything that starts another program — that is the
 * variant the SessionStart hook runs, where a `docker info` taking two seconds
 * would be two seconds in front of every single session.
 */
export async function inspect({ quick = false } = {}) {
  const checks = [];
  // `detail` is written as the reason something is missing, so it is dropped
  // once the thing is there — a passing check that still carries "AUTH_SECRET is
  // empty" reads as a finding to whoever parses the JSON.
  const add = (check) =>
    checks.push({ severity: "blocker", ...check, detail: check.ok ? "" : (check.detail ?? "") });

  // ── Node itself ───────────────────────────────────────────────────────────
  // This can only ever report "too old", never "missing": a missing Node could
  // not have run this file. Worth knowing when reading the output.
  const major = Number(process.versions.node.split(".")[0]);
  add({
    id: "node",
    label: `Node.js ${process.version}`,
    ok: major >= MIN_NODE,
    detail: major >= MIN_NODE ? "" : `needs ${MIN_NODE} or newer`,
    fix: FIXES.node,
  });

  // ── the project's own state ───────────────────────────────────────────────
  // Cheap (three file lookups and a TCP connect), so the hook runs them too.
  const hasEnv = existsSync(".env");
  add({
    id: "env",
    label: ".env",
    ok: hasEnv && Boolean(readEnvValue(".env", "AUTH_SECRET")),
    detail: hasEnv ? "AUTH_SECRET is empty" : "missing — is created from .env.example",
    fix: RUN_SETUP,
  });

  add({
    id: "deps",
    label: "Dependencies (node_modules)",
    ok: depsFresh(),
    detail: existsSync("node_modules") ? "older than package-lock.json" : "not installed yet",
    fix: RUN_SETUP,
  });

  // A written-down driver is read here because it costs nothing — no process is
  // started, so this is safe on the quick path. Which driver is actually in
  // force may need a look at Docker, and that happens below the quick return.
  // An unusable value is a finding of its own rather than an exception that
  // ends the report — doctor is the command somebody runs when things are broken.
  let driverError = "";
  try {
    configuredDriver();
  } catch (error) {
    driverError = error.message;
  }
  if (driverError) {
    add({
      id: "db-driver",
      label: "DB_DRIVER in .env",
      ok: false,
      detail: driverError.split("\n")[0].replace(/^✗ /, "").replace(/\.$/, ""),
      fix: everywhere({ note: "set DB_DRIVER=docker or DB_DRIVER=local in .env — or delete the line" }),
    });
  }

  const dbUrl = process.env.DATABASE_URL || (hasEnv ? readEnvValue(".env", "DATABASE_URL") : "");
  const dbPort =
    Number(urlPort(dbUrl, 0)) ||
    Number(process.env.DB_PORT || (hasEnv ? readEnvValue(".env", "DB_PORT") : "")) ||
    DEFAULT_DB_PORT;
  add({
    id: "database",
    label: `Database (port ${dbPort})`,
    ok: await portInUse(dbPort),
    detail: "does not answer — it is started along with the app",
    fix: RUN_SETUP,
    severity: "info",
  });

  if (quick) return checks;

  // ── the tools ─────────────────────────────────────────────────────────────
  add({ id: "npm", label: "npm", ok: await hasCommand("npm"), detail: "comes with Node.js", fix: FIXES.node });
  add({ id: "git", label: "git", ok: await hasCommand("git"), fix: await withLinuxFix("git") });

  // Which database this machine ends up running — and, on the first run, the
  // moment that gets decided and written into .env (scripts/db/driver.mjs).
  const driver = await dbDriver();

  // **Docker is never a blocker.** It is used where it exists and replaced
  // where it does not, so a missing Docker is a fact about the machine, not
  // something standing in the way. Reporting it as a blocker would send people
  // off to install Docker Desktop, WSL2 and a restart for a database that is
  // already running without any of it.
  const dockerThere = await hasCommand("docker");
  if (!dockerThere) {
    add({
      id: "docker",
      label: "Docker",
      ok: false,
      detail: "not installed — the database runs without it",
      severity: "optional",
      fix: await withLinuxFix("docker"),
    });
  } else {
    // Installed is not the same as running — ask the daemon, don't assume.
    const info = await capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
    add({
      id: "docker",
      label: "Docker",
      ok: info.code === 0,
      detail:
        driver === "docker"
          ? "installed, but not running — start Docker Desktop"
          : "installed, but not running — the database runs without it",
      severity: "optional",
      fix: await withLinuxFix("docker"),
    });
    if (info.code === 0) {
      const compose = await capture("docker", ["compose", "version"]);
      add({
        id: "docker-compose",
        label: "Docker Compose v2",
        ok: compose.code === 0,
        detail: "update Docker",
        severity: driver === "docker" ? "blocker" : "optional",
        fix: await withLinuxFix("docker"),
      });
    }
  }

  // Say which one is in force. Without this line the choice is invisible until
  // somebody wonders why their data is not where they expected it.
  add({
    id: "db-driver-in-use",
    label:
      driver === "docker"
        ? "Database: Postgres in Docker"
        : "Database: Postgres without Docker (DB_DRIVER=local)",
    ok: true,
    severity: "info",
  });

  // Only needed to receive Digistore24 IPNs on this machine.
  add({
    id: "cloudflared",
    label: "cloudflared (only for local IPNs)",
    ok: await hasCommand("cloudflared"),
    severity: "optional",
    fix: FIXES.cloudflared,
  });

  // On Windows the commands belong in Git Bash or WSL2. Git Bash sets MSYSTEM,
  // WSL sets WSL_DISTRO_NAME — neither means PowerShell or cmd, and there the
  // start scripts behave differently enough to be worth saying so.
  add({
    id: "shell",
    label: "Shell",
    ok: !isWindows || Boolean(process.env.MSYSTEM || process.env.WSL_DISTRO_NAME),
    detail: "this looks like PowerShell or cmd — use Git Bash or WSL2",
    severity: "info",
    fix: FIXES.shell,
  });

  return checks;
}

/** The static table, with the Linux entry upgraded to a real command if we can. */
async function withLinuxFix(id) {
  const found = await linuxFix(id);
  return found ? { ...FIXES[id], linux: found } : FIXES[id];
}

// ── output ──────────────────────────────────────────────────────────────────

/** The fix for the system we are on. */
export const fixFor = (check, platform = process.platform) =>
  check.fix?.[platform] ?? check.fix?.linux ?? null;

/** A one-line instruction out of a fix — the command, or the link, or the note. */
export function fixLine(fix) {
  if (!fix) return "";
  const parts = [fix.command || fix.url].filter(Boolean);
  if (fix.note) parts.push(`(${fix.note})`);
  return parts.join(" ");
}

/** Everything that genuinely stands in the way. */
export const blockers = (checks) => checks.filter((c) => !c.ok && c.severity === "blocker");

/** The text a person reads. */
export function render(checks) {
  const lines = [`This machine: ${process.platform} ${process.arch}, Node ${process.version}`, ""];
  for (const check of checks) {
    // The install hint is only interesting when the thing is missing.
    if (check.ok) {
      lines.push(`  ✓ ${check.label}`);
      continue;
    }
    const mark = check.severity === "blocker" ? "✗" : "·";
    const hint = [check.detail, fixLine(fixFor(check))].filter(Boolean).join(" — ");
    lines.push(`  ${mark} ${check.label}${hint ? ` — ${hint}` : ""}`);
  }

  const missing = blockers(checks);
  lines.push("");
  if (missing.length === 0) {
    lines.push("✓ Everything that is needed is there. Next: node run.mjs start");
  } else {
    lines.push(`✗ ${missing.length} thing(s) missing — install them, then run doctor again.`);
  }
  return lines.join("\n");
}

/** `node run.mjs doctor` — and `--json` for whoever reads it as data. */
export async function doctor(args = []) {
  const checks = await inspect();
  if (args.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          ok: blockers(checks).length === 0,
          checks: checks.map((check) => ({ ...check, fix: fixFor(check) })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(render(checks));
  }
  if (blockers(checks).length > 0) process.exit(1);
}
