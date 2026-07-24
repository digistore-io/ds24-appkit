// Starting other programs — the one place that knows the Windows quirks.
//
// Two rules, and they are the whole reason this file exists (CLAUDE.md →
// Three systems):
//
//  1. **Our own scripts run through `process.execPath`**, never through a
//     shell. `node scripts/users/create-user.mjs --email "a b@c.de"` then keeps
//     its arguments exactly as given — a shell would re-split them, and on
//     Windows with different quoting rules than on Linux.
//  2. **`npm` and `npx` need `shell: true`.** They are `.cmd` shims on Windows,
//     and Node has refused to spawn those without a shell since 18.20/20.12
//     (it fails with EINVAL). `docker` is a real executable and needs nothing.
//
// Everything here is promise-based; nothing polls a process table.
import { spawn } from "node:child_process";

/** True while running on Windows — the flag that decides the two rules above. */
export const isWindows = process.platform === "win32";

/**
 * Run a command, its output going straight to the terminal.
 * Resolves with the exit code (it does not throw on a non-zero one).
 */
export function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
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

/** Run an npm script (`npm run <name>`). Needs a shell on Windows, see rule 2. */
export function runNpm(args, options = {}) {
  return run("npm", args, { shell: isWindows, ...options });
}

/**
 * Run a command and capture its output instead of showing it.
 * Resolves with `{ code, stdout, stderr }`; a missing binary is code 127.
 */
export function capture(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
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
  const { code } = await capture(command, versionArgs, { shell: isWindows });
  return code === 0;
}

/** Sleep, for the wait loops. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
