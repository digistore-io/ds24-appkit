#!/usr/bin/env node
// Calls every page of the app once and reports which ones are broken. Catches
// exactly what tests and `npm run build` do NOT catch: errors that only show up
// when rendering with a real database and a real .env — the classic "Internal
// Server Error" on a page nobody has ever opened.
//
// Usage (the app has to be running — `node run.mjs start`):
//   node scripts/dev/smoke.mjs          (or: node run.mjs smoke)
//   node scripts/dev/smoke.mjs --url https://staging.example.de
//
// Verdict:
//   5xx          → FAILURE, exit code 1
//   2xx/3xx/4xx  → answered. A redirect to /login is the expected behaviour on
//                  protected pages, not a defect.
//   an error in the log → FAILURE, even when the page answered 200.
//
// That last line is the one worth understanding. A status code says the server
// answered, not that the page rendered: next-intl catches a bad date, writes
// the error to stderr and renders the raw value into the cell. The page is 200
// and visibly wrong. So the log is read around the sweep, and anything that
// appeared in it counts (scripts/dev/log-errors.mjs).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findErrors, markLog } from "./log-errors.mjs";

const args = process.argv.slice(2);
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
for (const route of routes) {
  const url = `${baseUrl}${route}`;
  try {
    // redirect: "manual" — a 307 to /login is the result we are interested
    // in; following it would only measure /login all over again.
    const answer = await fetch(url, { redirect: "manual" });
    const status = answer.status;
    if (status >= 500) {
      failures++;
      console.log(`  ✗ ${status}  ${route}`);
      // In dev mode the Next error page contains the message — its first line
      // saves you the trip into the log.
      const text = await answer.text();
      const match = text.match(/<h2[^>]*>([^<]+)<\/h2>|"message":"([^"]+)"/);
      if (match) console.log(`         ${(match[1] || match[2]).trim()}`);
    } else {
      const note = status >= 300 && status < 400 ? " (redirect)" : "";
      console.log(`  ✓ ${status}  ${route}${note}`);
    }
  } catch (err) {
    failures++;
    console.log(`  ✗ ---  ${route} — not reachable: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(
    `\n✗ ${failures} page(s) with a server error.\n` +
      "  Look at the cause in the log: node run.mjs logs\n" +
      "  Do not ship before that is fixed.",
  );
  process.exit(1);
}

console.log(`\n✓ All ${routes.length} page(s) answer without a server error.`);

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
}
