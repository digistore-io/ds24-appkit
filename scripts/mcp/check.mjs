// Checks the MCP server — settings, and (with --live) a real round-trip.
//
//   node run.mjs mcp-check
//   node run.mjs mcp-check --live
//   node run.mjs mcp-check --live --email you@example.com
//
// Two jobs:
//
//  1. **Settings.** `config/mcp.json` against `config/digistore-products.json`.
//     `npm run test` fails on the same problems, but it says "expected [] to
//     equal [...]"; this says which field and what to put there.
//  2. **Does it actually answer?** `--live` mints a temporary key, calls
//     `initialize` and `tools/list` against the running app, prints the tools
//     the way a client will see them, and revokes the key again. That is the
//     only check that covers the whole path — settings, route, auth, registry.
//     Green tests are no proof that an endpoint answers.
//
// Plain Node, no bundler, no TypeScript, no dependency beyond what the app
// already has — it has to run on Linux, macOS and in a Git Bash on Windows
// (CLAUDE.md, "Three systems"). `fetch` is built in; there is no curl here.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { connect, parseArgs } from "../users/_db.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Kept in step with lib/mcp/rules.ts by hand — this script cannot import the
// TypeScript. If the prefix ever changes there, it changes here too; a mismatch
// shows up immediately as a --live run that gets a 401.
const KEY_PREFIX = "ds24mcp_";
const PROTOCOL_VERSION = "2025-11-25";

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), "utf8"));
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// ── 1. The settings ─────────────────────────────────────────────────────────

const config = readJson("config", "mcp.json");
const registry = readJson("config", "digistore-products.json");

const problems = [];

if (typeof config.enabled !== "boolean") {
  problems.push('"enabled" must be true or false.');
}
if (typeof config.serverName !== "string" || config.serverName.trim() === "") {
  problems.push('"serverName" must be a name — clients show it next to the key.');
}

if (config.requiresPlan != null) {
  const product = registry.products?.[config.requiresPlan];
  if (!product) {
    problems.push(
      `"requiresPlan": there is no product "${config.requiresPlan}" in config/digistore-products.json.`,
    );
  } else if (product.kind === "token") {
    problems.push(
      `"requiresPlan": "${config.requiresPlan}" is a token package. A balance is not an ` +
        `entitlement, so hasPlan() answers false for it for ever — every customer would be locked out.`,
    );
  }
}

console.log("MCP server\n");
console.log(`  enabled       ${config.enabled ? "yes" : "no  (config/mcp.json → \"enabled\": true)"}`);
console.log(`  serverName    ${config.serverName}`);
console.log(`  requiresPlan  ${config.requiresPlan ?? "— (every signed-in member)"}`);
console.log(`  instructions  ${config.instructions ? `${config.instructions.length} characters` : "— (none)"}`);
console.log(`  protocol      ${PROTOCOL_VERSION}`);

if (problems.length > 0) {
  console.error("\nProblems in config/mcp.json:");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const endpoint = `${appUrl}/api/mcp`;
console.log(`  endpoint      ${endpoint}`);

if (!config.enabled) {
  console.log(
    "\nThe server is switched off, so it answers 404. Set \"enabled\": true in " +
      "config/mcp.json once you have decided what your app should expose — the skill " +
      "`mcp-server` walks through that.",
  );
  process.exit(0);
}

console.log("\n✓ The settings are coherent.");

const args = parseArgs(process.argv.slice(2));
if (!args.live) {
  console.log("\nTo actually call it (the app has to be running):  node run.mjs mcp-check --live");
  process.exit(0);
}

// ── 2. The round-trip ───────────────────────────────────────────────────────

const sql = connect();

try {
  // Whose key. A member, not an owner, by default: the point is to see what a
  // CUSTOMER sees, and an owner holds the same tools anyway (there are no
  // operator tools — see lib/mcp/tools.ts).
  const wanted = typeof args.email === "string" ? args.email.trim().toLowerCase() : null;
  const [member] = wanted
    ? await sql`select id, email from users where lower(email) = ${wanted} limit 1`
    : await sql`select id, email from users order by "createdAt" asc limit 1`;

  if (!member) {
    fail(
      wanted
        ? `No account for ${wanted}. Create one: node run.mjs user-create --email ${wanted} --apply`
        : "There is no account in the database yet. Create one: node run.mjs user-create --email you@example.com --apply",
    );
  }

  // A throw-away key, revoked in the `finally` below whatever happens. It is
  // written straight to the table rather than through the UI so this stays one
  // command; it is a real key for its lifetime and the endpoint cannot tell the
  // difference — which is the point.
  const secret = KEY_PREFIX + randomBytes(32).toString("base64url");
  const keyId = randomUUID();
  await sql`
    insert into mcp_keys (id, member_id, name, token_hash, prefix, scope, expires_at)
    values (
      ${keyId}, ${member.id}, ${"mcp-check (temporary)"},
      ${createHash("sha256").update(secret, "utf8").digest("hex")},
      ${secret.slice(0, KEY_PREFIX.length + 4)}, ${"write"},
      ${new Date(Date.now() + 5 * 60_000)}
    )`;

  console.log(`\nCalling ${endpoint} as ${member.email} …`);

  async function rpc(method, params) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": PROTOCOL_VERSION,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch (error) {
      fail(
        `Could not reach ${endpoint}: ${error.message}\n` +
          `  Is the app running? node run.mjs status — and check APP_URL in .env.`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      fail(`${method} answered HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const body = JSON.parse(text);
    if (body.error) fail(`${method} answered an error: ${body.error.message}`);
    return body.result;
  }

  const init = await rpc("initialize", { protocolVersion: PROTOCOL_VERSION });
  console.log(`  ✓ initialize   ${init.serverInfo.name} ${init.serverInfo.version} (${init.protocolVersion})`);

  const list = await rpc("tools/list");
  console.log(`  ✓ tools/list   ${list.tools.length} tool(s) this account may use\n`);

  for (const tool of list.tools) {
    const kind = tool.annotations?.readOnlyHint ? "read " : "write";
    console.log(`    [${kind}] ${tool.name}`);
    console.log(`             ${tool.description.slice(0, 100)}${tool.description.length > 100 ? "…" : ""}`);
  }

  if (list.tools.length === 0) {
    console.log(
      "    (none — either every tool is behind a plan this account does not hold,\n" +
        "     or lib/mcp/tools.ts is empty. A client would show a connector that can do nothing.)",
    );
  }

  console.log(
    `\n✓ The server answers.\n\nA customer connects a client like this:\n\n` +
      `  claude mcp add --transport http ${config.serverName} ${endpoint} \\\n` +
      `    --header "Authorization: Bearer ds24mcp_…"\n\n` +
      `They create their own key at /dashboard/account. See docs/mcp.md.`,
  );

  // Revoked rather than deleted, so the row is still there to be seen if
  // somebody wonders what that key was.
  await sql`update mcp_keys set revoked_at = now() where id = ${keyId}`;
} finally {
  await sql.end();
}
