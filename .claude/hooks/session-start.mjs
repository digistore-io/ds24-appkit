// Greeting when Claude Code starts in this project.
//
// Runs as a SessionStart hook (see .claude/settings.json). Whatever lands on
// stdout here is what the user sees in the terminal — and Claude gets it as
// context. So: keep it short, say concretely what to do next.
//
// Node and not bash, like everything else that has to run on Linux, macOS and
// Windows alike (CLAUDE.md → Three systems). This one matters more than most:
// it is the very first thing anybody sees in this project.
//
// Note: when a freshly cloned project is opened for the first time, Claude Code
// asks whether it should trust the project folder. Only after that does this hook run.
import { existsSync, readdirSync } from "node:fs";

const hasEnv = existsSync(".env");
const hasBrief = existsSync("docs/product-brief.md");

// Has an app of their own already been built? A rough, but reliable indicator:
// own pages below app/dashboard/ beyond the ones that ship with the template.
const SHIPPED = new Set(["admin", "plans", "abo", "account", "billing"]);
let customPages = 0;
try {
  customPages = readdirSync("app/dashboard", { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && !SHIPPED.has(entry.name),
  ).length;
} catch {
  /* no dashboard folder yet — then there is nothing of their own either */
}

const line = "──────────────────────────────────────────────────────────────────";
console.log(line);
console.log("Digistore SAAS Template — this is where you build your own SAAS app,");
console.log("billed through Digistore24.");
console.log("");

if (customPages > 0 || hasBrief) {
  // A project already under way — do not bother them with beginner text.
  console.log("What do you want to carry on with?");
  console.log("The path: build → payment → security → legal → live → marketing.");
  console.log('Say e.g. "carry on with the app" or "set up the payment".');
} else {
  console.log("This is how you start — just say:");
  console.log("");
  console.log('    "Build my app"');
  console.log("");
  console.log("No idea yet? Just say so, and we will find one together.");
  if (!hasEnv) {
    console.log("(I will take care of the setup — database, .env — along the way.)");
  }
}

console.log(line);

// Context for Claude (the user sees these lines as well, so keep them neutral
// and terse):
console.log(`[Project state: .env=${hasEnv}, product-brief=${hasBrief}, own pages=${customPages}]`);
