// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PROBE_PATH,
  activeTunnelUrl,
  appPort,
  clearTunnel,
  openTunnel,
  probe,
  processAlive,
  readTunnel,
  shouldRestoreTunnel,
  stopPid,
  writeTunnel,
} from "./_tunnel.mjs";

/** A fetch stand-in: one canned answer, and it records what it was asked. */
function fakeFetch(answer: unknown) {
  const calls: string[] = [];
  const impl: typeof fetch = async (input) => {
    calls.push(String(input));
    if (answer instanceof Error) throw answer;
    return answer as Response;
  };
  return { impl, calls };
}

const ok = { status: 200, text: async () => "OK" };

describe("probe", () => {
  it("accepts only the answer our own IPN route gives", async () => {
    const { impl } = fakeFetch(ok);
    expect(await probe("https://x.trycloudflare.com", { fetchImpl: impl })).toBe(true);
  });

  it("asks the IPN route, because that is what Digistore24 will ask", async () => {
    const { impl, calls } = fakeFetch(ok);
    await probe("https://x.trycloudflare.com", { fetchImpl: impl });
    expect(calls).toEqual([`https://x.trycloudflare.com${PROBE_PATH}`]);
  });

  it("refuses a stranger who answers 200 with something else", async () => {
    // A recycled quick-tunnel address, a captive portal, a parked domain: all
    // of them answer 200. Only our app answers "OK".
    const { impl } = fakeFetch({ status: 200, text: async () => "<html>hello</html>" });
    expect(await probe("https://x.trycloudflare.com", { fetchImpl: impl })).toBe(false);
  });

  it("refuses anything that is not 200 — Digistore24 insists on 200 too", async () => {
    for (const status of [204, 301, 302, 404, 500]) {
      const { impl } = fakeFetch({ status, text: async () => "OK" });
      expect(await probe("https://x.trycloudflare.com", { fetchImpl: impl })).toBe(false);
    }
  });

  it("treats an unreachable address as dead, not as an exception", async () => {
    const { impl } = fakeFetch(new Error("ECONNREFUSED"));
    expect(await probe("https://gone.trycloudflare.com", { fetchImpl: impl })).toBe(false);
  });
});

// The state files are read from the working directory (.dev/), so these tests
// run inside a throwaway one.
describe("tunnel state", () => {
  const original = process.cwd();
  const dirs: string[] = [];

  function inTempDir() {
    const dir = mkdtempSync(join(tmpdir(), "tunnel-"));
    dirs.push(dir);
    process.chdir(dir);
    mkdirSync(".dev", { recursive: true });
    return dir;
  }

  afterEach(() => {
    process.chdir(original);
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("remembers an address and its process across a round trip", () => {
    inTempDir();
    writeTunnel({ url: "https://a.trycloudflare.com", pid: 4242 });
    expect(readTunnel()).toEqual({ url: "https://a.trycloudflare.com", pid: 4242 });
  });

  it("knows nothing when nothing was written", () => {
    inTempDir();
    expect(readTunnel()).toBeNull();
  });

  it("survives a pid file that is missing or unusable", () => {
    inTempDir();
    writeFileSync(join(".dev", "tunnel.url"), "https://a.trycloudflare.com\n");
    expect(readTunnel()).toEqual({ url: "https://a.trycloudflare.com", pid: null });

    writeFileSync(join(".dev", "tunnel.pid"), "not-a-number\n");
    expect(readTunnel()?.pid).toBeNull();
  });

  it("forgets everything on clear", () => {
    inTempDir();
    writeTunnel({ url: "https://a.trycloudflare.com", pid: 1 });
    clearTunnel();
    expect(readTunnel()).toBeNull();
  });

  it("hands out the address while our process is alive", () => {
    inTempDir();
    writeTunnel({ url: "https://a.trycloudflare.com", pid: process.pid });
    expect(activeTunnelUrl()).toBe("https://a.trycloudflare.com");
  });

  it("forgets the address once the process is gone", () => {
    inTempDir();
    writeTunnel({ url: "https://dead.trycloudflare.com", pid: unusedPid() });
    expect(activeTunnelUrl()).toBeNull();
    expect(readTunnel()).toBeNull();
  });

  it("keeps an address with no pid rather than throwing it away", () => {
    inTempDir();
    writeFileSync(join(".dev", "tunnel.url"), "https://a.trycloudflare.com\n");
    expect(activeTunnelUrl()).toBe("https://a.trycloudflare.com");
  });

  it("REGRESSION: an unreachable tunnel is not a dead one", () => {
    // This cost us a stranded cloudflared once. This machine could not resolve
    // the brand-new trycloudflare name for several minutes — Digistore24 could,
    // and had happily accepted it. Deciding "gone" from that probe deleted the
    // PID file, so `node run.mjs stop` had nothing left to kill and the machine stayed
    // published to the internet.
    //
    // Hence: the network says nothing about whether the process exists.
    inTempDir();
    writeTunnel({ url: "https://unresolvable.trycloudflare.com", pid: process.pid });

    expect(activeTunnelUrl()).toBe("https://unresolvable.trycloudflare.com");
    expect(readTunnel()?.pid).toBe(process.pid);
  });
});

describe("appPort", () => {
  const original = process.cwd();
  let dir = "";

  afterEach(() => {
    process.chdir(original);
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function inTempDir() {
    dir = mkdtempSync(join(tmpdir(), "port-"));
    process.chdir(dir);
    mkdirSync(".dev", { recursive: true });
  }

  it("takes an explicit port over everything else", () => {
    inTempDir();
    writeFileSync(join(".dev", "port"), "3007\n");
    expect(appPort("3005")).toBe(3005);
  });

  it("otherwise uses the port `node run.mjs start` settled on", () => {
    // The app moves out of the way of a busy port and records where it went;
    // the tunnel has to follow it there, or it forwards to nothing.
    inTempDir();
    writeFileSync(join(".dev", "port"), "3007\n");
    expect(appPort()).toBe(3007);
  });

  it("falls back to 3000 when there is nothing to go on", () => {
    inTempDir();
    expect(appPort()).toBe(3000);
    writeFileSync(join(".dev", "port"), "nonsense\n");
    expect(appPort()).toBe(3000);
    expect(appPort("also-nonsense")).toBe(3000);
  });
});

describe("shouldRestoreTunnel", () => {
  const local = { domainId: "local-test", appUrl: "http://localhost:3000", alreadyRunning: false };

  it("brings the tunnel back for an app that was receiving IPNs", () => {
    expect(shouldRestoreTunnel(local)).toBe(true);
  });

  it("leaves an app alone that never received one", () => {
    // No DIGISTORE_IPN_DOMAIN_ID = no IPN connection was ever set up. `make
    // start` runs dozens of times a day for work that has nothing to do with
    // billing; it must not publish the machine to the internet on its own.
    expect(shouldRestoreTunnel({ ...local, domainId: undefined })).toBe(false);
    expect(shouldRestoreTunnel({ ...local, domainId: "" })).toBe(false);
  });

  it("never touches STAGING or PROD", () => {
    // There APP_URL *is* the IPN address. A tunnel would overwrite the live
    // registration with a temporary address and silently break real purchases.
    expect(shouldRestoreTunnel({ ...local, appUrl: "https://app.example.de" })).toBe(false);
    expect(shouldRestoreTunnel({ ...local, appUrl: "  https://app.example.de  " })).toBe(false);
  });

  it("does not open a second one next to a running tunnel", () => {
    expect(shouldRestoreTunnel({ ...local, alreadyRunning: true })).toBe(false);
  });

  it("says no when asked about nothing", () => {
    expect(shouldRestoreTunnel()).toBe(false);
    expect(shouldRestoreTunnel({})).toBe(false);
  });
});

describe("openTunnel", () => {
  it("refuses before spawning anything when no app is listening", async () => {
    // Guards the pointless case: a tunnel onto a dead port would forward
    // nothing, and Digistore24's HTTP-200 check would fail on it.
    const result = await openTunnel({ port: 1 });
    expect(result).toEqual({ ok: false, reason: "no-app" });
  });
});

describe("stopPid", () => {
  const spawned: ReturnType<typeof spawn>[] = [];

  afterEach(() => {
    for (const c of spawned.splice(0)) {
      try {
        if (c.pid) process.kill(c.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  });

  /** A real child that does nothing but stay alive. */
  function longRunning() {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    spawned.push(child);
    return child;
  }

  it("ends a running process and reports it only once it is truly gone", async () => {
    const child = longRunning();
    expect(processAlive(child.pid)).toBe(true);

    const outcome = await stopPid(child.pid);

    expect(outcome).toBe("stopped");
    // The point of the whole exercise: when it says stopped, it IS stopped.
    expect(processAlive(child.pid)).toBe(false);
  });

  it("insists with SIGKILL when the process ignores a polite request", async () => {
    // A child that swallows SIGTERM — cloudflared does shut down, but a wedged
    // process must not leave the machine published either.
    const child = spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    spawned.push(child);
    await new Promise((r) => setTimeout(r, 300)); // let the handler register

    const outcome = await stopPid(child.pid, { graceMs: 500 });

    expect(outcome).toBe("killed");
    expect(processAlive(child.pid)).toBe(false);
  });

  it("treats an already-dead process as done, not as a failure", async () => {
    expect(await stopPid(unusedPid())).toBe("gone");
  });

  it("does not fall over on a missing pid", async () => {
    expect(await stopPid(null)).toBe("gone");
    expect(await stopPid(0)).toBe("gone");
  });
});

describe("processAlive", () => {
  it("sees the process running this test", () => {
    expect(processAlive(process.pid)).toBe(true);
  });

  it("does not see one that is gone", () => {
    expect(processAlive(unusedPid())).toBe(false);
  });

  it("says no to nothing at all", () => {
    expect(processAlive(0)).toBe(false);
    expect(processAlive(null)).toBe(false);
  });
});

/** A PID that is almost certainly free — high, and verified unused. */
function unusedPid() {
  for (let pid = 999_999; pid > 900_000; pid--) {
    if (!processAlive(pid)) return pid;
  }
  throw new Error("no free pid found");
}
