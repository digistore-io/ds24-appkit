#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Calls every page of the app once and reports which ones are broken. Catches
// exactly what tests and `npm run build` do NOT catch: errors that only show up
// when rendering with a real database and a real .env — the classic "Internal
// Server Error" on a page nobody has ever opened.
//
// Usage (the app has to be running — `node run.mjs start`):
//   node scripts/dev/smoke.mjs          (or: node run.mjs smoke)
//   node scripts/dev/smoke.mjs --url https://staging.example.de
//   node scripts/dev/smoke.mjs --no-signed-in    (only the anonymous sweep)
//
// It runs in TWO passes, and the second one is the interesting half:
//
//   1. anonymous — every page once. A 307 to /login here is the correct answer
//      for a protected page, and it says nothing at all about that page.
//   2. signed in — exactly the pages that redirected above, now with a real
//      session (scripts/dev/sign-in.mjs). These are the pages with the queries
//      in them: the operator's, the member's, everything touching money and
//      roles. Without this pass they were only ever exercised when a person
//      opened them by hand.
//
// WHO is signed in depends on where the app runs, and the difference matters:
//
//   - locally: the OWNER, via the development login — every protected page
//     renders, admin pages included.
//   - deployed (--url): the smoke MEMBER, via the real password sign-in —
//     provisioned once with `node run.mjs smoke-account`. Owner-only pages
//     answer a member with a redirect, so remotely they count as redirects,
//     never as rendered. The log check below is local-only too. A remote run
//     is therefore the smaller half of smoke — run it locally as well.
//
// Either pass can be unavailable — and then it SAYS SO, in one line, with the
// reason. A sweep that quietly stopped being signed in would report green
// while checking nothing.
//
// Verdict:
//   5xx                          → FAILURE, exit code 1
//   3xx to /login WHILE SIGNED IN → FAILURE: the session did not take
//   other 2xx/3xx/4xx            → answered. A signed-in page redirecting to
//                                  /plans is a hasPlan() gate doing its job.
//   an error in the log          → FAILURE, even when the page answered 200.
//
// That last line is the one worth understanding. A status code says the server
// answered, not that the page rendered: next-intl catches a bad date, writes
// the error to stderr and renders the raw value into the cell. The page is 200
// and visibly wrong. So the log is read around the sweep, and anything that
// appeared in it counts (scripts/dev/log-errors.mjs).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findErrors, markLog } from "./log-errors.mjs";
import { signInAsOwner, signInAsSmokeMember } from "./sign-in.mjs";

const args = process.argv.slice(2);
const wantSignedIn = !args.includes("--no-signed-in");
const baseUrl = (
  args[args.indexOf("--url") + 1]?.startsWith("http")
    ? args[args.indexOf("--url") + 1]
    : process.env.APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Collects the static routes from the app/ directory.
 *
 * Deliberately skipped:
 *   [param]  — dynamic segments; not sensibly callable without a real ID
 *   (group)  — route groups, which do not show up in the URL
 *   api/     — not pages; those have tests of their own
 */
function collectRoutes(dir = "app", urlPath = "") {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  if (entries.includes("page.tsx") || entries.includes("page.jsx")) {
    found.push(urlPath === "" ? "/" : urlPath);
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === "api" || entry.startsWith("_")) continue;
    if (entry.startsWith("[")) continue; // dynamic — no real ID at hand
    if (entry.startsWith("(")) {
      found.push(...collectRoutes(full, urlPath)); // group: URL unchanged
      continue;
    }
    found.push(...collectRoutes(full, `${urlPath}/${entry}`));
  }
  return found;
}

const routes = [...new Set(collectRoutes())].sort();
if (routes.length === 0) {
  console.error("✗ No pages found under app/ — start from the project root.");
  process.exit(1);
}

console.log(`Checking ${routes.length} page(s) on ${baseUrl}\n`);

// The log only exists for a dev server on this machine. `node run.mjs smoke`
// always passes --url (so that it cannot green-light another project answering
// on 3000), which is why the test is "is this host local", not "was --url given".
const isLocal = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(baseUrl);
// Taken before the first request: everything after this mark was caused by us.
const logMark = isLocal ? markLog() : 0;

let failures = 0;

/**
 * Call one page and judge the answer.
 *
 * `cookie` is empty on the anonymous pass and holds a real session on the second
 * one — which is the only thing that changes the judgement: being sent to /login
 * is correct without a session and a defect with one.
 *
 * @returns {Promise<{toLogin: boolean}>}
 */
async function callPage(route, cookie = "") {
  const url = `${baseUrl}${route}`;
  try {
    // redirect: "manual" — a 307 to /login is the result we are interested
    // in; following it would only measure /login all over again.
    const answer = await fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie } : undefined,
    });
    const status = answer.status;
    const location = answer.headers.get("location") ?? "";
    const toLogin = status >= 300 && status < 400 && /\/login(\?|$)/.test(location);

    if (status >= 500) {
      failures++;
      console.log(`  ✗ ${status}  ${route}`);
      // In dev mode the Next error page contains the message — its first line
      // saves you the trip into the log.
      const text = await answer.text();
      const match = text.match(/<h2[^>]*>([^<]+)<\/h2>|"message":"([^"]+)"/);
      if (match) console.log(`         ${(match[1] || match[2]).trim()}`);
      return { toLogin: false };
    }

    if (cookie && toLogin) {
      // We are signed in and the app sent us to the sign-in page anyway. Either
      // the session did not reach the app or the account cannot use it — both
      // mean this page has still not been rendered by anybody.
      failures++;
      console.log(`  ✗ ${status}  ${route} — sent to /login despite a session`);
      return { toLogin: true };
    }

    // A signed-in page redirecting somewhere ELSE is not a defect: that is what
    // a hasPlan() gate looks like from the outside (CLAUDE.md → Access).
    const note = status >= 300 && status < 400 ? ` (redirect → ${location || "?"})` : "";
    console.log(`  ✓ ${status}  ${route}${note}`);
    return { toLogin };
  } catch (err) {
    failures++;
    console.log(`  ✗ ---  ${route} — not reachable: ${err.message}`);
    return { toLogin: false };
  }
}

const gated = [];
for (const route of routes) {
  const { toLogin } = await callPage(route);
  if (toLogin) gated.push(route);
}

// ── the second pass ─────────────────────────────────────────────────────────
// Locally as the owner (development login), remotely as the smoke member (the
// real password sign-in, provisioned by `node run.mjs smoke-account`). Where
// neither door opens, the right answer is that these pages were not checked,
// said plainly.
let signedInPages = 0;
if (gated.length > 0 && wantSignedIn) {
  const session = isLocal ? await signInAsOwner(baseUrl) : await signInAsSmokeMember(baseUrl);
  if (session.skipped) {
    console.log(`\n·  ${gated.length} protected page(s) NOT checked — ${session.reason}`);
  } else {
    console.log(
      `\nSigned in as ${session.as} (${session.role}) — the ${gated.length} protected page(s) again:\n`,
    );
    if (session.role === "member") {
      console.log("·  as a member — owner-only pages count as a redirect here, not as rendered\n");
    }
    for (const route of gated) await callPage(route, session.cookie);
    signedInPages = gated.length;
  }
} else if (gated.length > 0) {
  console.log(`\n·  ${gated.length} protected page(s) NOT checked — --no-signed-in`);
}

if (failures > 0) {
  console.error(
    `\n✗ ${failures} page(s) with a server error.\n` +
      "  Look at the cause in the log: node run.mjs logs\n" +
      "  Do not ship before that is fixed.",
  );
  process.exit(1);
}

console.log(
  `\n✓ All ${routes.length} page(s) answer without a server error` +
    `${signedInPages > 0 ? `, ${signedInPages} of them signed in` : ""}.`,
);

// A page can answer 200 and still be broken. Whatever the requests above wrote
// into the log is exactly that case.
if (isLocal) {
  const logged = findErrors(logMark);
  if (logged.length > 0) {
    console.error(
      `\n✗ …but the log picked up ${logged.length} error(s) while they were being called:\n`,
    );
    for (const { message, location, frame, count } of logged) {
      console.error(`  ${message}${count > 1 ? `  (${count}×)` : ""}`);
      if (location) console.error(`    ${location}`);
      if (frame) console.error(`    ${frame}`);
    }
    console.error("\n  In full, with the hints: node run.mjs errors");
    process.exit(1);
  }
  console.log("✓ Nothing in the log either.");
} else {
  console.log(
    "·  the server log was not read — that check exists only for the local app,\n" +
      "   so a 200 with an error behind it passes here. Run smoke locally too.",
  );
}
