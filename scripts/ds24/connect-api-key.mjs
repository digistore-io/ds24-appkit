#!/usr/bin/env node
// Fetch a Digistore24 API key and write it into the .env.
//
// Two routes:
//
//  A) Default — fully automatic. The script starts a short-lived local server,
//     opens the Digistore24 approval page in the browser, catches the redirect
//     coming back and picks up the finished API key. It uses the built-in
//     developer key; your own can be set via DIGISTORE_DEVELOPER_KEY in the
//     .env.
//
//  B) --manual: The script opens the Digistore24 page where you create an API
//     key yourself, and you paste it in here.
//
// In both cases the key ends up in the local `.env` — which is listed in
// .gitignore and is NOT checked in.
//
// Flow according to the DS24 docs: requestApiKey (with the developer key) →
// user confirms on request_url → redirect back to return_url →
// retrieveApiKey(token) → api_key.
// https://dev.digistore24.com/hc/en-us/articles/32486158815121
//
// Disconnecting again: the DS24 function `unregister()` deletes the key on the
// server side together with the IPN connections belonging to it — afterwards
// remove the value from the .env.
//
// Usage:
//   node scripts/ds24/connect-api-key.mjs           (or: node run.mjs ds24-connect)
//   node scripts/ds24/connect-api-key.mjs --manual  (force route B)
//   node scripts/ds24/connect-api-key.mjs --print   (write nothing, just show)
//   node scripts/ds24/connect-api-key.mjs --port 53682   (different local port)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import "../lib/env.mjs";
import { ds24Call, parseArgs } from "./_client.mjs";
import { publicUrlFor, redirUrl } from "./_public-url.mjs";
import { setEnvValue } from "../lib/env-write.mjs";

// Built-in developer key. A developer key carries no account permissions, it
// only identifies the calling application — the role of an OAuth client ID.
// Not a secret, which is why it sits openly in the code and is deliberately not
// obfuscated. The permission-bearing API key only comes into being once the
// merchant approves the access in the browser, and afterwards lives solely in
// that merchant's local .env.
const BUILT_IN_DEVELOPER_KEY =
  "1706550-aASzoSnqcChueKmMDBvcwqUWvOqnfhXTncfkTN6X"; // gitleaks:allow trufflehog:ignore pragma: allowlist secret NOSONAR nosemgrep

const args = parseArgs(process.argv.slice(2));
const printOnly = Boolean(args.print);
const devKey = process.env.DIGISTORE_DEVELOPER_KEY || BUILT_IN_DEVELOPER_KEY;
const manual = Boolean(args.manual);
const baseUrl = (process.env.DIGISTORE_URL || "https://www.digistore24.com").replace(/\/$/, "");
const ENV_FILE = ".env";
const CALLBACK_PORT = Number(args.port || 53682);

// Return address. Digistore24 does NOT accept a localhost address as
// return_url — but the local listener sits exactly there. Hence the same detour
// every other localhost URL takes here: the public /redir/ page, which forwards
// the browser back to localhost (scripts/ds24/_public-url.mjs). That page never
// sees the API key: it is exchanged further down via retrieveApiKey directly
// between this script and Digistore24, the redirect only carries the "approved"
// signal. Source of the page: web-site/ in the template source repo.
const REDIR_URL = redirUrl();
// Only for testing against a DS24 test host that lets localhost through.
const noRelay = Boolean(args["no-relay"]);

/** Opens a URL in the default browser (best effort, cross-platform). */
function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function showLink(url, hint) {
  console.log(`\n${hint}`);
  console.log(`\n  ${url}\n`);
  if (!openBrowser(url)) {
    console.log("(The browser could not be opened automatically — copy the link above.)");
  } else {
    console.log("(The browser was opened. If not: copy the link above.)");
  }
}

function done(apiKey, extras = {}) {
  if (printOnly) {
    console.log(`\nAPI key (not saved): ${apiKey}`);
    return;
  }
  setEnvValue(ENV_FILE, "DIGISTORE_API_KEY", apiKey);
  for (const [k, v] of Object.entries(extras)) if (v) setEnvValue(ENV_FILE, k, v);
  console.log(`\n✓ DIGISTORE_API_KEY saved in ${ENV_FILE}.`);
  console.log("  .env is listed in .gitignore — the key does not end up in the repository.");
  console.log("\nNext step: node run.mjs ds24-sync");
}

// ---------------------------------------------------------------------------
// Route B — manual: open the page, paste the key in.
// ---------------------------------------------------------------------------
async function manualRoute() {
  showLink(
    `${baseUrl}/settings/account-access`,
    "Create an API key for yourself at Digistore24:",
  );
  console.log("There: Settings → Account access → “API keys” tab →");
  console.log("“New API key” → choose “writable” as the permission → Save.");
  console.log("");
  console.log("Without write permissions the app can neither create products nor");
  console.log("generate checkout links.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = (await rl.question("Paste the API key here: ")).trim();
  rl.close();

  if (!key) {
    console.error("\n✗ No key entered — aborted.");
    process.exit(1);
  }
  done(key);
}

// ---------------------------------------------------------------------------
// Route A — automatic, via the developer key.
// ---------------------------------------------------------------------------
async function automaticRoute() {
  const localCallback = `http://localhost:${CALLBACK_PORT}/callback`;
  const returnUrl = noRelay ? localCallback : publicUrlFor(localCallback, REDIR_URL);
  const permissions = process.env.DIGISTORE_REQUESTED_PERMISSIONS || "writable";

  // DS24 insists on https for site_url as well — it rejects an http://localhost.
  // During local development (APP_URL is http/localhost) we therefore send the
  // public relay domain as the identifier; only a real https APP_URL is passed
  // through. Not the /redir/ address itself: site_url is meant to say which site
  // is asking, and a redirect endpoint is not one.
  const appUrl = process.env.APP_URL || "";
  const siteUrl = appUrl.startsWith("https://")
    ? appUrl
    : new URL(REDIR_URL).origin;

  const answer = await ds24Call("requestApiKey", devKey, {
    permissions,
    return_url: returnUrl,
    cancel_url: returnUrl,
    site_url: siteUrl,
    comment: "SAAS app (terminal setup)",
  });
  const requestUrl = answer?.request_url;
  const requestToken = answer?.request_token;
  if (!requestUrl || !requestToken) {
    console.error("✗ Digistore24 returned no request_url/request_token.");
    process.exit(1);
  }

  // Wait for the redirect back — the listener lives for this one call only.
  //
  // Two of them, on 127.0.0.1 and on ::1: the browser is sent to "localhost",
  // and which of the two that resolves to differs from machine to machine. A
  // single IPv4 listener would leave everyone whose resolver answers ::1 first
  // waiting forever. Loopback only, deliberately — nothing outside this machine
  // is meant to reach it.
  const callbackReceived = new Promise((resolve, reject) => {
    const servers = [];
    const shutDown = () => servers.forEach((s) => s.close());

    const listen = (host, required) => {
      const server = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body style='font-family:sans-serif;padding:2rem'>" +
            "<h1>Done</h1><p>You can close this window and return to the terminal.</p>" +
            "</body></html>",
        );
        shutDown();
        resolve();
      });
      // Only the IPv4 side is fatal. A machine without IPv6 simply has no ::1,
      // and that is not a reason to abort the setup.
      server.on("error", (err) => (required ? reject(err) : server.close()));
      server.listen(CALLBACK_PORT, host);
      servers.push(server);
    };

    listen("127.0.0.1", true);
    listen("::1", false);

    // Don't hang around forever if the user aborts.
    setTimeout(() => {
      shutDown();
      reject(new Error("Timed out (5 minutes) — nothing saved."));
    }, 300_000).unref();
  });

  showLink(requestUrl, "Please approve the access at Digistore24:");
  console.log("Waiting for the approval …");
  await callbackReceived;

  const result = await ds24Call("retrieveApiKey", devKey, { token: requestToken });
  if (result?.request_status !== "completed" || !result?.api_key) {
    console.error(
      `\n✗ Approval not completed (status: ${result?.request_status || "unknown"}).`,
    );
    process.exit(1);
  }
  // On some accounts the SHA passphrase comes along right away — save it too.
  done(result.api_key, {
    DIGISTORE_IPN_PASSPHRASE: result.thankyou_page_key,
  });
}

if (manual) {
  await manualRoute();
} else {
  await automaticRoute();
}
