#!/usr/bin/env node
// Fetch a Digistore24 API key and write it into the .env.
//
// Two routes:
//
//  A) Default — fully automatic. The script opens the Digistore24 approval page
//     in the browser and asks Digistore24 itself, every couple of seconds,
//     whether the approval has happened yet. It uses the developer key the
//     template ships with (lib/digistore/config.mjs).
//
//  B) --manual: The script opens the Digistore24 page where you create an API
//     key yourself, and you paste it in here.
//
// In both cases the key ends up in the local `.env` — which is listed in
// .gitignore and is NOT checked in.
//
// Flow according to the DS24 docs: requestApiKey (with the developer key) →
// user confirms on request_url → retrieveApiKey(token) → api_key. The
// return_url only decides where the browser is left standing afterwards; it is
// not how this script finds out. retrieveApiKey answers an unconfirmed request
// with request_status "pending" (and result "success"), so asking again is the
// documented way to wait.
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
//   node scripts/ds24/connect-api-key.mjs --port 3005  (the app runs on this port)
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import "../lib/env.mjs";
import { ds24Call, parseArgs } from "./_client.mjs";
import { publicUrlFor } from "./_public-url.mjs";
import { setEnvValue } from "../lib/env-write.mjs";
import { rememberedPort } from "../dev/app-port.mjs";
import {
  DIGISTORE_API_URL,
  DIGISTORE_DEVELOPER_KEY,
  DIGISTORE_REDIR_URL,
  DIGISTORE_REQUESTED_PERMISSIONS,
} from "../../lib/digistore/config.mjs";

const args = parseArgs(process.argv.slice(2));
const printOnly = Boolean(args.print);
const devKey = DIGISTORE_DEVELOPER_KEY;
const manual = Boolean(args.manual);
const baseUrl = DIGISTORE_API_URL.replace(/\/$/, "");
const ENV_FILE = ".env";

// Where the browser lands after the approval: a page of THIS app, on the web
// server that is running anyway.
//
// There is deliberately no second web server here any more. This script used to
// open one on a high port for exactly one request — and it could not survive
// long enough: whoever first has to sign in at Digistore24 needs longer than
// the script waits, and by the time they approve, the port answers nothing. The
// browser then showed "this page cannot be loaded" while the approval itself
// had gone through perfectly.
//
// So the browser is now sent somewhere that is still there minutes later, and
// the approval is not read from an incoming request at all: the script asks
// Digistore24 itself (retrieveApiKey, further down). The landing page is
// therefore pure courtesy — if the app happens not to be running, the terminal
// still gets the key.
const CALLBACK_PATH = "/ds24-connected";
const REDIR_URL = DIGISTORE_REDIR_URL;

// Digistore24 does NOT accept a localhost address as return_url, and locally
// that is exactly where the app sits. Hence the same detour every other
// localhost URL takes here: the public /redir/ page, which forwards the browser
// back to localhost (scripts/ds24/_public-url.mjs). That page never sees the API
// key — it is exchanged directly between this script and Digistore24, and the
// redirect carries nothing but a browser. Source: web-site/ in the source repo.
//
// APP_URL is the authority on the app's address: `node run.mjs start` writes the
// port it really took in there (scripts/dev/app-port.mjs). .dev/port is the
// fallback for a project that has never been started, 3000 the one after that.
function appBaseUrl() {
  if (args.port) return `http://localhost:${Number(args.port)}`;
  const fromEnv = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return `http://localhost:${rememberedPort() ?? 3000}`;
}
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
    // A missing `xdg-open` — a headless Linux box, a container, a server over
    // SSH — does NOT throw here: spawn reports it asynchronously as an 'error'
    // event, and an 'error' event nobody listens for takes the whole process
    // down. That would kill the setup on exactly the machines where the printed
    // link above is the only way through. The link is already on screen, so
    // there is nothing left to say here.
    child.on("error", () => {});
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

const POLL_INTERVAL_MS = 2_000;
// Eight minutes, and the number is not free: the agent running this command is
// told to allow it ten (.claude/skills/setup-digistore). Giving up first means
// the user reads our sentence instead of a killed process.
const APPROVAL_TIMEOUT_MS = 8 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Digistore24 whether the merchant has approved yet.
 *
 * `retrieveApiKey` answers a pending request with `result: "success"` and
 * `request_status: "pending"` — so a pending approval is a normal answer here,
 * not an error, and asking again is the intended way to find out. That is what
 * makes the local listener unnecessary: nothing has to reach this machine, the
 * script goes and looks.
 */
async function waitForApproval(token) {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let failures = 0;

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        "Timed out (8 minutes) — nothing saved. Run the command again.",
      );
    }
    await sleep(POLL_INTERVAL_MS);

    let answer;
    try {
      answer = await ds24Call("retrieveApiKey", devKey, { token });
      failures = 0;
    } catch (err) {
      // A hiccup on the line is not an answer, and giving up on the first one
      // would throw away an approval the user has already granted. Five in a
      // row is a different thing and says so.
      if (++failures >= 5) throw err;
      continue;
    }

    if (answer?.request_status !== "pending") return answer;
  }
}

async function automaticRoute() {
  const landing = `${appBaseUrl()}${CALLBACK_PATH}`;
  const returnUrl = noRelay ? landing : publicUrlFor(landing, REDIR_URL);
  const permissions = DIGISTORE_REQUESTED_PERMISSIONS;

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

  showLink(requestUrl, "Please approve the access at Digistore24:");
  console.log("Waiting for the approval — take your time, this waits for you.");

  const result = await waitForApproval(requestToken);
  if (result?.request_status !== "completed" || !result?.api_key) {
    console.error(
      `\n✗ Approval not completed (status: ${result?.request_status || "unknown"}).`,
    );
    process.exit(1);
  }
  // Say it in the terminal too. The browser may well be showing an error —
  // whoever has not started the app yet lands on a page that does not answer —
  // and that is exactly the moment somebody concludes the setup failed.
  console.log("✓ Approval received.");
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
