// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// State of the local IPN tunnel — shared by `tunnel.mjs` (which manages it) and
// `ipn-setup.mjs` (which wants to know whether one is running).
//
// Three small files under .dev/ hold everything:
//   tunnel.url   the public https address
//   tunnel.pid   the cloudflared process, so `node run.mjs stop` can end it
//   tunnel.log   cloudflared's output (that is where the address comes from)
//
// **Two different questions, two different answers — do not mix them up.**
//
//   "Is a tunnel of ours running?"   → the PID (`process.kill(pid, 0)`)
//   "Does it forward right now?"     → a GET on the address
//
// The first governs stopping and cleanup, the second governs *using* the
// address. Deciding the first one with a network probe is a trap that costs
// real money: a freshly created trycloudflare.com name does not resolve on
// every machine for the first few minutes (corporate DNS, a VPN, a resolver
// caching the negative answer) while Digistore24 resolves it perfectly well.
// Treating that as "no tunnel" deletes the PID we would need to stop it — and
// leaves cloudflared running, with this machine published to the internet and
// nothing left that remembers it.
//
// A failed probe means "I could not reach it from here", never "it is not
// there". Only `process.kill(pid, 0)` is allowed to declare a tunnel gone, and
// that call behaves the same on Linux, macOS and Windows.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXES, fixFor, fixLine } from "../dev/doctor.mjs";

export const DEV_DIR = ".dev";
export const URL_FILE = join(DEV_DIR, "tunnel.url");
export const PID_FILE = join(DEV_DIR, "tunnel.pid");
export const LOG_FILE = join(DEV_DIR, "tunnel.log");

// The IPN route answers a GET with "OK" — the very question Digistore24 asks
// before it accepts an address. Probing that path therefore tests the whole
// chain (tunnel forwards → app runs → route works), not merely "something
// listens".
export const PROBE_PATH = "/api/ipn";

function readFile(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

/** The remembered tunnel — no check whether it still runs. */
export function readTunnel() {
  const url = readFile(URL_FILE);
  if (!url) return null;
  const pid = Number.parseInt(readFile(PID_FILE), 10);
  return { url, pid: Number.isInteger(pid) && pid > 0 ? pid : null };
}

export function writeTunnel({ url, pid }) {
  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(URL_FILE, `${url}\n`);
  if (pid) writeFileSync(PID_FILE, `${pid}\n`);
}

/** Forget the tunnel. The log stays — it is what you read after a failure. */
export function clearTunnel() {
  for (const f of [URL_FILE, PID_FILE]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

/**
 * Does something answer at `url` the way our IPN route does?
 * Returns true only on HTTP 200 with the body "OK" — a captive portal or a
 * stranger's server on a recycled address gets no free pass.
 */
export async function probe(url, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${url}${PROBE_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    if (res.status !== 200) return false;
    return (await res.text()).trim() === "OK";
  } catch {
    return false;
  }
}

/**
 * Is the process still there? Signal 0 sends nothing — it only asks. Node
 * implements it on Windows too, which is why this and not `pgrep`/`ps`.
 *
 * EPERM means the process exists but belongs to someone else: existing is the
 * question, so that counts as alive.
 *
 * (A recycled PID could in theory belong to a stranger by now. We only ever
 * kill a number we wrote down ourselves moments earlier, so the window is
 * small — and the alternative, killing nothing, is the worse failure.)
 */
export function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// Built from the table rather than written out here. This message used to carry
// its own list of install commands, one per system — a second copy that nobody
// maintained, on systems nobody here runs. `scripts/dev/fixes.json` is the one
// place; see the header of `scripts/dev/doctor.mjs`.
//
// Only the line for THIS machine is printed: whoever reads this is standing on
// one of the three systems, and the other two are noise in front of the answer.
export const CLOUDFLARED_MISSING = `cloudflared is not installed. Installation (one-time):

  ${fixLine(fixFor({ fix: FIXES.cloudflared }))}`;

/** The port `node run.mjs start` settled on — it moves out of the way of busy ports. */
export function appPort(argPort) {
  if (argPort) {
    const p = Number.parseInt(argPort, 10);
    if (Number.isInteger(p) && p > 0) return p;
  }
  try {
    const p = Number.parseInt(readFileSync(join(DEV_DIR, "port"), "utf8").trim(), 10);
    if (Number.isInteger(p) && p > 0) return p;
  } catch {
    /* no .dev/port yet — fall through to the default */
  }
  return 3000;
}

/**
 * Open a Cloudflare Quick Tunnel onto the local app and remember it.
 *
 * Shared by `tunnel.mjs start` and by `ipn-setup.mjs --auto`, which opens one
 * when it needs a public address and none is there. Registering the IPN is
 * NOT done here — both callers do that themselves, which is what keeps the two
 * from calling each other in a circle.
 *
 * @param {{port?: number, log?: (msg: string) => void}} [opts]
 * @returns {Promise<{ok: true, url: string, pid: number} | {ok: false, reason: "no-app"|"no-cloudflared"|"no-url", detail?: string}>}
 */
export async function openTunnel({ port = appPort(), log = () => {} } = {}) {
  // Without a running app there is nothing to forward, and Digistore24's check
  // would fail on an address that answers with nothing.
  if (!(await probe(`http://localhost:${port}`))) return { ok: false, reason: "no-app" };

  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(LOG_FILE, "");

  log(`>> Cloudflare Quick Tunnel to http://localhost:${port}`);
  const fd = openSync(LOG_FILE, "a");
  let child;
  try {
    child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      detached: true,
      stdio: ["ignore", fd, fd],
    });
  } catch {
    return { ok: false, reason: "no-cloudflared" };
  }

  // A spawn that cannot find the binary reports it asynchronously, not by throwing.
  let spawnError = null;
  child.on("error", (err) => {
    spawnError = err;
  });
  // Let it run on without us: the caller returns, the tunnel stays.
  child.unref();

  let url = null;
  for (let i = 0; i < 60 && !spawnError; i++) {
    const m = TUNNEL_RE.exec(readFile(LOG_FILE));
    if (m) {
      url = m[0];
      break;
    }
    await sleep(500);
  }

  if (spawnError) {
    return spawnError.code === "ENOENT"
      ? { ok: false, reason: "no-cloudflared" }
      : { ok: false, reason: "no-url", detail: spawnError.message };
  }
  if (!url) {
    await stopPid(child.pid);
    return { ok: false, reason: "no-url", detail: readFile(LOG_FILE).split("\n").slice(-20).join("\n") };
  }

  writeTunnel({ url, pid: child.pid });
  return { ok: true, url, pid: child.pid };
}

/**
 * May `node run.mjs start` re-open the tunnel? Pure decision, kept apart from the doing
 * because it is the one that puts this machine on the internet.
 *
 * Yes only for an app that demonstrably WAS receiving Digistore24 events:
 *
 * - `domainId` (DIGISTORE_IPN_DOMAIN_ID, written when an IPN connection was
 *   first set up). Without it nothing was ever received, and `node run.mjs start` —
 *   which runs dozens of times a day for work with no billing in it — must not
 *   publish the machine.
 * - a local `appUrl`. A public one IS the IPN address; a tunnel would be wrong
 *   there and would overwrite the live registration with a temporary address.
 * - nothing running yet, or there is nothing to restore.
 */
export function shouldRestoreTunnel({ domainId, appUrl, alreadyRunning } = {}) {
  if (alreadyRunning) return false;
  if (!domainId) return false;
  return !/^https:\/\//.test((appUrl || "").trim());
}

/**
 * A courtesy check, kept short on purpose. Plenty of machines cannot resolve a
 * brand-new trycloudflare name for the first few minutes while Digistore24
 * resolves it immediately — so a "no" here proves nothing, and waiting long for
 * it would only make every start slow. The verdict that counts is the one
 * Digistore24 reaches with its own call.
 */
export async function waitReachable(url, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    if (await probe(url)) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * End a process — and make sure it actually ended.
 *
 * `process.kill()` returning without throwing means the signal was *delivered*,
 * not that the process is gone; cloudflared shuts down gracefully and takes a
 * moment. Reporting "closed" on the strength of the send is how you end up
 * telling someone their machine is off the internet while it is still on it.
 * So: ask with SIGTERM, wait for it to become true, insist with SIGKILL.
 *
 * Both signals are mapped to TerminateProcess on Windows, so this reads the
 * same on all three systems.
 *
 * @returns "gone" (was not running) | "stopped" | "killed" | "stubborn"
 */
export async function stopPid(pid, { graceMs = 5000, killMs = 2000, stepMs = 250 } = {}) {
  if (!processAlive(pid)) return "gone";
  try {
    process.kill(pid);
  } catch {
    return "gone";
  }
  for (let waited = 0; waited < graceMs; waited += stepMs) {
    if (!processAlive(pid)) return "stopped";
    await sleep(stepMs);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return "gone";
  }
  for (let waited = 0; waited < killMs; waited += stepMs) {
    if (!processAlive(pid)) return "killed";
    await sleep(stepMs);
  }
  return "stubborn";
}

/**
 * The address of a tunnel of ours that is still running, or null.
 *
 * Deliberately decided by the PID and not by a probe — see the header. A
 * tunnel that runs but cannot be reached *from this machine* is still a
 * perfectly good IPN address, because Digistore24 calls it from somewhere
 * else. Handing it over and letting Digistore24 judge (it performs its own GET
 * and insists on HTTP 200) beats refusing it here on worse evidence.
 *
 * State is cleared only when the process is provably gone — never on a failed
 * probe, which would strand a running cloudflared with nothing to stop it.
 */
export function activeTunnelUrl() {
  const state = readTunnel();
  if (!state) return null;
  // No PID recorded (hand-written file, or a crash between the two writes):
  // keep the address rather than throw it away — a probe elsewhere can still
  // vouch for it, and there is no process for us to leak.
  if (state.pid === null) return state.url;
  if (processAlive(state.pid)) return state.url;
  clearTunnel();
  return null;
}
