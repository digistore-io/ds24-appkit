// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Starting other programs — the one place that knows the Windows quirks.
//
// Two rules, and they are the whole reason this file exists (CLAUDE.md →
// Three systems):
//
//  1. **Our own scripts run through `process.execPath`**, never through a
//     shell. `node scripts/users/create-user.mjs --email "a b@c.de"` then keeps
//     its arguments exactly as given — a shell would re-split them, and on
//     Windows with different quoting rules than on Linux.
//  2. **A `.cmd` shim is the only thing left that needs cmd.exe.** `npm` is one
//     on Windows, and Node has refused to spawn `.cmd`/`.bat` without a shell
//     since 18.20/20.12 (it fails with EINVAL). `git`, `docker`, `cloudflared`,
//     `node` and the hosting CLIs are real `.exe` files and need nothing — so
//     `spawnCommand()` looks the command up on the PATH first and reaches for a
//     shell only where the file leaves it no choice.
//
// That second rule used to read "npm needs `shell: true`", and it was handed an
// args array beside that flag — which is the combination Node 24 deprecated
// (DEP0190). The reason is worth knowing, because it is not pedantry: with
// `shell: true` Node builds the command line as a plain
// `[file, ...args].join(" ")` and escapes nothing, so an argument carrying a
// `&` or a `;` stops being an argument. It cannot tell whether those tokens
// came from a program or from a person, so it warns every time.
//
// Here it can be told: every argument that reaches the shell path is a literal
// in this repository — user input goes through `runScript()`, which uses no
// shell at all. But "trust us" is not something a warning can read, and the
// concatenation really was unsafe in one place (see `openUrl()`). So the
// command line is built HERE instead, by `cmdLine()`, with each argument
// quoted, and Node is handed a finished string. Same result on the calls we
// already made, correct on the one we got wrong, and no warning in front of the
// first command a Windows developer runs.
//
// `scripts/portability.test.ts` fails the build if a `shell:` option turns up in
// any other tooling script — this decision belongs in one place or in none.
//
// Everything here is promise-based; nothing polls a process table.
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** True while running on Windows — the flag that decides the two rules above. */
export const isWindows = process.platform === "win32";

// ── finding a command ───────────────────────────────────────────────────────

/** What Windows appends to a bare command name, in the order it tries them. */
const pathExtensions = () =>
  (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

/** Is `file` there, and would this system run it? */
function runnable(file) {
  try {
    // On Windows the extension decides, and the caller above has already picked
    // it; asking for X_OK there answers a question NTFS does not really have and
    // calls every readable file executable.
    accessSync(file, isWindows ? constants.F_OK : constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Where `command` lives on the PATH, or null.
 *
 * This is not here for convenience. On Windows it is what decides whether a
 * shell is needed at all (rule 2), and the name alone cannot say: `npm` is a
 * `.cmd`, `node` is an `.exe`, and both are spelled the same way when you type
 * them.
 */
export function whichCommand(command) {
  const name = String(command);
  // Something that already says where it is was never a PATH question.
  if (name.includes("/") || name.includes("\\")) return runnable(name) ? name : null;

  const directories = (process.env.PATH || "").split(delimiter).filter(Boolean);
  // The name as written first — for whoever typed `npm.cmd` themselves — then
  // the extensions Windows would have tried on their behalf.
  const suffixes = isWindows ? ["", ...pathExtensions()] : [""];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = join(directory, name + suffix);
      if (runnable(candidate)) return candidate;
    }
  }
  return null;
}

// ── handing cmd.exe a command line ──────────────────────────────────────────

/**
 * What cmd.exe reads as syntax rather than as text.
 *
 * `&` is the one that actually bit: Digistore24's approval link carries query
 * parameters, and an unquoted `&` ended the command line at the first of them —
 * the browser opened a truncated address and cmd tried to run the remainder.
 */
const CMD_SYNTAX = /[\s&|<>^(),;=]/;

/**
 * The one character this cannot honestly quote.
 *
 * A `"` has to satisfy cmd.exe's rules *and* the target program's parsing of
 * the same string, and the two disagree. `%` and `!` are deliberately NOT in
 * here: cmd expands `%NAME%` only for a variable that exists, and `!` only
 * under delayed expansion, which `/d /s /c` does not switch on — so a
 * percent-encoded URL survives, which is the case that actually occurs.
 */
const CMD_UNQUOTABLE = /"/;

/** One argument, safe to hand cmd.exe — or an error saying why it is not. */
export function cmdQuote(argument) {
  const text = String(argument);
  if (CMD_UNQUOTABLE.test(text)) {
    throw new Error(
      `✗ cannot pass ${JSON.stringify(text)} through cmd.exe — a double quote has no honest escaping here`,
    );
  }
  return text === "" || CMD_SYNTAX.test(text) ? `"${text}"` : text;
}

/** The command line Node used to concatenate — built here, and quoted. */
export const cmdLine = (command, args = []) => [command, ...args].map(cmdQuote).join(" ");

/** Windows spells a shim `.cmd` or `.bat`; everything else runs on its own. */
const isShim = (file) => /\.(cmd|bat)$/i.test(file);

/** cmd.exe, told to run one line and exit. The flags are explained at the call. */
const runOneLine = (line, options) =>
  spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
    ...options,
    // `/d` skips the AutoRun registry key, `/s` makes cmd strip exactly the
    // outer pair of quotes and take the rest verbatim, `/c` runs and exits —
    // the same three Node uses internally, for the same reasons. Verbatim
    // arguments stop Node re-quoting the line we just finished quoting.
    windowsVerbatimArguments: true,
  });

/**
 * Start `command`, going through cmd.exe only where Windows leaves no choice.
 *
 * Every spawn in this file goes through here, which is what makes rule 2 a
 * property of the project rather than of whoever wrote the call.
 */
export function spawnCommand(command, args = [], options = {}) {
  if (!isWindows) return spawn(command, args, options);

  const resolved = whichCommand(command);
  // A real executable takes its arguments straight from Node, unmangled — and
  // that is most of them. It is also the better path: nothing is quoted here,
  // so nothing can be quoted wrongly.
  if (!resolved || !isShim(resolved)) return spawn(command, args, options);

  return runOneLine(cmdLine(resolved, args), options);
}

// ── the helpers everything else uses ────────────────────────────────────────

/**
 * Run a command, its output going straight to the terminal.
 * Resolves with the exit code (it does not throw on a non-zero one).
 */
export function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawnCommand(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", (error) => {
      console.error(`✗ ${command} could not be started: ${error.message}`);
      resolve(error.code === "ENOENT" ? 127 : 1);
    });
    child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

/** Run one of our own .mjs scripts with the current Node — no shell involved. */
export function runScript(scriptPath, args = [], options = {}) {
  return run(process.execPath, [scriptPath, ...args], options);
}

/** Run an npm script (`npm run <name>`). On Windows npm is the shim — see rule 2. */
export function runNpm(args, options = {}) {
  return run("npm", args, options);
}

/**
 * Run a command and capture its output instead of showing it.
 * Resolves with `{ code, stdout, stderr }`; a missing binary is code 127.
 */
export function capture(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawnCommand(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      resolve({ code: error.code === "ENOENT" ? 127 : 1, stdout, stderr: error.message });
    });
    child.on("close", (code, signal) => {
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr });
    });
  });
}

/** Is this command on the PATH? Asks it for its version rather than guessing. */
export async function hasCommand(command, versionArgs = ["--version"]) {
  const { code } = await capture(command, versionArgs);
  return code === 0;
}

/**
 * Open a URL in whatever browser this machine calls its own. Best effort — the
 * caller has already printed the link, so a failure here is not one.
 *
 * On Windows this is the single command in the project that genuinely cannot
 * avoid a shell: `start` is not a program, it is a word cmd.exe understands.
 * Which is precisely why it lives here and not at the call site — and why the
 * URL goes through `cmdQuote()` on the way (see `CMD_SYNTAX`).
 */
export function openUrl(url) {
  try {
    const child = isWindows
      ? // `start ""` — the empty argument is the window title. Leave it out and
        // cmd reads the quoted URL as the title and opens nothing at all.
        runOneLine(cmdLine("start", ["", url]), { stdio: "ignore", detached: true })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
          stdio: "ignore",
          detached: true,
        });
    // A missing `xdg-open` — a headless Linux box, a container, a server over
    // SSH — does NOT throw here: spawn reports it asynchronously as an 'error'
    // event, and an 'error' event nobody listens for takes the whole process
    // down. That would kill the setup on exactly the machines where the printed
    // link is the only way through.
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Sleep, for the wait loops. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
