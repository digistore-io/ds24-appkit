// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Port helpers for the start-up scripts — and the URL surgery that goes with
// them (`DATABASE_URL`, `APP_URL` follow the port they run on).
//
// Why a TCP connect and not lsof/ss/netstat: those are not installed
// everywhere, they differ per system, and `lsof` does not even show sockets
// belonging to another user — a database container published by root would
// look free. A connection attempt is available everywhere and answers exactly
// the question that matters here: "is anyone already accepting connections on
// this port?" See the rule "ask the thing, not the process table" in CLAUDE.md.
import net from "node:net";

/** Is anyone accepting connections on this port? */
export function portInUse(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    // Refused, unreachable or too slow to answer — nothing is listening for us.
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host);
  });
}

/**
 * The first free port at or above `start`. If nothing is found within
 * `attempts`, `start` is returned — whoever binds it will complain anyway, and
 * that message is more useful than one from here.
 */
export async function freePort(start, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const port = start + i;
    if (!(await portInUse(port))) return port;
  }
  return start;
}

/** Port out of a postgres://…:5432/… URL (or `fallback` if it carries none). */
export function urlPort(url, fallback = "") {
  try {
    const port = new URL(url).port;
    return port || String(fallback);
  } catch {
    return String(fallback);
  }
}

/** The same URL with a different port. */
export function urlSetPort(url, port) {
  try {
    const parsed = new URL(url);
    parsed.port = String(port);
    let out = parsed.toString();
    // `new URL("http://host:3000").toString()` appends the root slash. Hand the
    // caller back the shape it gave us — APP_URL is compared as a string.
    if (!url.endsWith("/") && out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return url;
  }
}
