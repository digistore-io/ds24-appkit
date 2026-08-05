// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Greeting when a session starts in this project.
//
// It lives here and not under any one program's folder because all four invoke
// it: .claude/settings.json, .codex/hooks.json, .gemini/settings.json and
// .opencode/plugins/session-start.js all point at this file, and
// `node run.mjs greet` runs it by hand when a hook did not fire. Whatever lands
// on stdout is what the user sees in the terminal — and the agent gets it as
// context. So: keep it short, say concretely what to do next.
//
// Node and not bash, like everything else that has to run on Linux, macOS and
// Windows alike (CLAUDE.md → Three systems). This one matters more than most:
// it is the very first thing anybody sees in this project.
//
// And exactly there is the one thing this file cannot do: it is started WITH
// `node`, so on a machine that has none it does not run, prints nothing, and
// "nothing" reads like "all fine". That is why each config carries a second,
// tiny hook in front of this one — three words of shell asking whether `node`
// exists at all. It is the one check that cannot be written here, and
// CLAUDE.md → Three systems says so out loud.
//
// Note: when a freshly cloned project is opened for the first time, most of
// these programs ask whether they should trust the folder. Only after that does
// the greeting run.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { approvalReport, describeApproval } from "../ds24/_approval.mjs";
import { blockers, inspect } from "./doctor.mjs";
import { readNotes, unwrittenPages } from "./app-notes.mjs";
import { readStamp, stampValid, verifiedOn } from "./setup-stamp.mjs";
import { describe as describeUpdate, updateAvailable } from "./update-check.mjs";

const hasEnv = existsSync(".env");
const hasBrief = existsSync("docs/product-brief.md");

// Is this machine ready to work in? Only the cheap half of the checklist runs
// here — file lookups and one TCP connect. The full `node run.mjs doctor` asks
// the Docker daemon, which takes seconds, and this hook sits in front of EVERY
// session. A slow greeting would be paid for on every single start, to answer a
// question that is only interesting on the first few.
//
// Never fatal: a hook that throws greets the user with a stack trace, and the
// one situation this exists for — a half-set-up project — is exactly where
// something is most likely to be missing.
let blocked = [];
try {
  blocked = blockers(await inspect({ quick: true }));
} catch {
  /* then we simply say nothing about the setup */
}

// Has an app of their own already been built? A rough, but reliable indicator:
// own pages below app/dashboard/ beyond the ones that ship with the template.
//
// This list has to match what is actually in app/dashboard/, and it silently
// stops doing so the moment somebody adds a page here — the count then never
// reaches 0 and every first-time user is greeted with "carry on with what?"
// instead of the one line the whole README points at ("Build my app").
// `scripts/session-start.test.ts` fails the build when the two drift apart.
const SHIPPED = new Set(["account", "admin", "billing", "chat"]);
let ownPages = [];
try {
  ownPages = readdirSync("app/dashboard", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SHIPPED.has(entry.name))
    .map((entry) => entry.name);
} catch {
  /* no dashboard folder yet — then there is nothing of their own either */
}
const customPages = ownPages.length;

// Is what they built written down? `docs/app.md` is this app's own notebook, and
// the next session's only source for what the last one did — see
// scripts/dev/app-notes.mjs for why this is asked by content and not by date.
const unwritten = unwrittenPages(ownPages, readNotes((file) => readFileSync(file, "utf8")));

// Has this machine ever been through the full checklist? The quick checks above
// answer "is something obviously missing"; this answers "did anybody ever look",
// which is a different question and the one that decides whether `build-app` has
// to run `doctor` itself (scripts/dev/setup-stamp.mjs).
const stamp = readStamp();
const verifiedDay = stampValid(stamp) ? verifiedOn(stamp) : "";

// Two questions that may cost a request, and neither depends on the other:
//
//   Has the template been improved since this app was copied out of it? Asked
//   at most once a day — scripts/dev/update-check.mjs, including how to switch
//   it off.
//   Are the synced Digistore24 products approved for sale yet? Same shape, one
//   listProducts call a day at most — scripts/ds24/_approval.mjs.
//
// **Together, not one after the other.** Awaited in sequence they add up to
// 5.5 s of dead air in front of every session on a network that blackholes
// instead of refusing — in the file whose own header says to keep it short.
// The `.catch` on each is belt and braces: both are written never to reject,
// and if that ever stops being true a rejected promise here would take the
// whole greeting with it, which is the one thing this file must not do.
const [updateResult, approvalResult] = await Promise.all([
  updateAvailable().catch(() => null),
  approvalReport().catch(() => null),
]);
const updateLine = describeUpdate(updateResult);
const approvalLine = describeApproval(approvalResult);

const line = "──────────────────────────────────────────────────────────────────";
console.log(line);
console.log("Digistore SAAS Template — this is where you build your own SAAS app,");
console.log("billed through Digistore24.");
console.log("");

if (customPages > 0 || hasBrief) {
  // A project already under way — do not bother them with beginner text.
  console.log("What do you want to carry on with?");
  console.log(
    "The path: build → payment → experience → security → legal → live → marketing.",
  );
  console.log('Say e.g. "carry on with the app" or "set up the payment".');
} else {
  console.log("This is how you start — just say:");
  console.log("");
  console.log('    "Build my app"');
  console.log("");
  console.log("No idea yet? Just say so, and we will find one together.");
}

if (blocked.length > 0) {
  console.log("");
  console.log("(A couple of things still need setting up here — I will take care of that first.)");
}

console.log(line);

// Context for Claude (the user sees these lines as well, so keep them neutral
// and terse):
console.log(`[Project state: .env=${hasEnv}, product-brief=${hasBrief}, own pages=${customPages}]`);
if (updateLine) console.log(updateLine);
if (approvalLine) console.log(approvalLine);
if (unwritten.length > 0) {
  console.log(
    `[App notes: docs/app.md does not cover ${unwritten.join(", ")}. ` +
      `Write the entry when the feature works — CLAUDE.md → Adding a feature, step 9.]`,
  );
}
if (blocked.length > 0) {
  console.log(
    `[Setup: blocked — ${blocked.map((c) => c.id).join(", ")}. ` +
      `Run the skill setup-machine BEFORE building anything.]`,
  );
} else if (verifiedDay) {
  // The full checklist went through on this machine — so whoever starts building
  // may take this line as the answer and skip their own `doctor` run.
  console.log(`[Setup: ok — verified ${verifiedDay}]`);
} else {
  // The cheap checks are green, but the expensive half (the Docker daemon, the
  // dependencies, the migrations) has never been confirmed here. Said as a
  // separate state on purpose: "ok" alone would be read as "checked", and the
  // one thing this project cannot afford is an app built on an untested machine.
  console.log("[Setup: ok — not verified yet. Run `node run.mjs doctor` before building.]");
}
