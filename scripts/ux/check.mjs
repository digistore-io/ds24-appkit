// What is measurably wrong with this app's interface.
//
//   node run.mjs ux-check
//
// The counterpart to `legal-check`, `ai-check` and `kb-check`, for the rules in
// docs/ux.md. It is the narrow half of the skill `ux-gateway`: everything in
// here is a fact a machine can settle — a contrast ratio, a class that is in
// the file, a page that is in no menu. Whether the wording is clear, whether
// the first five minutes make sense, whether a flow has a dead end: none of
// that is here, because a script cannot know it, and pretending otherwise is
// how a report earns its way into the bin.
//
// So a green run does NOT mean the app is good. It means the things that can be
// counted have been counted. The skill does the rest.
//
// It reports; it never writes. The rules themselves are in ./rules.mjs, tested
// in ./rules.test.ts.
//
// Plain Node, no bundler, no TypeScript, no dependency — Linux, macOS and Git
// Bash on Windows (CLAUDE.md, "Three systems").
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve, sep } from "node:path";

import {
  TEXT_PAIRS,
  RING_PAIRS,
  parseHsl,
  contrastRatio,
  parseTokens,
  findPaletteClasses,
  findRawElements,
  findUnnamedIconButtons,
  findImagesWithoutAlt,
  navHrefs,
} from "./rules.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ── Walking the tree ─────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".dev", "drizzle"]);

function walk(dir, onFile) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

/** Every page under app/dashboard, as a route. Dynamic segments are skipped. */
function dashboardRoutes(appDir) {
  const routes = [];
  walk(join(appDir, "dashboard"), (file) => {
    const rel = relative(appDir, file).split(sep).join("/");
    if (!rel.endsWith("/page.tsx") && rel !== "page.tsx") return;
    const route = "/" + rel.replace(/\/?page\.tsx$/, "");
    // A [id] page is opened from somewhere else with a real record. It has no
    // place in a menu, and its absence from one is not a finding.
    if (route.includes("[")) return;
    routes.push(route);
  });
  return routes.sort();
}

/** The .tsx files this checks — the app's own, never the kit's. */
function sourceFiles() {
  const files = [];
  const collect = (file) => {
    if (!file.endsWith(".tsx")) return;
    const rel = relative(ROOT, file).split(sep).join("/");
    // components/ui/** is shadcn's code, not the app's. It is allowed to write
    // the primitives everybody else is told to use instead.
    if (rel.startsWith("components/ui/")) return;
    files.push(rel);
  };
  walk(join(ROOT, "app"), collect);
  walk(join(ROOT, "components"), collect);
  return files.sort();
}

// ── Reporting ────────────────────────────────────────────────────────────────

let problems = 0;
let warnings = 0;

const fail = (what, why) => {
  problems++;
  console.log(`  ❌ ${what}\n     ${why}`);
};
const warn = (what, why) => {
  warnings++;
  console.log(`  ⚠️  ${what}\n     ${why}`);
};
const ok = (what) => console.log(`  ✓ ${what}`);

/** At most this many example lines per finding — the rest is a count. */
const EXAMPLES = 5;

function detail(hits, why) {
  const shown = hits
    .slice(0, EXAMPLES)
    .map((h) => `${h.file}:${h.line}  ${h.found}`)
    .join("\n     ");
  const more =
    hits.length > EXAMPLES ? `\n     … and ${hits.length - EXAMPLES} more` : "";
  return `${why}\n     ${shown}${more}`;
}

function report(hits, what, why) {
  if (hits.length === 0) return false;
  fail(`${what} (${hits.length})`, detail(hits, why));
  return true;
}

function reportWarning(hits, what, why) {
  if (hits.length === 0) return false;
  warn(`${what} (${hits.length})`, detail(hits, why));
  return true;
}

// ── 1 · Colours ──────────────────────────────────────────────────────────────

function checkContrast() {
  console.log("\nColours — can everything be read, in both modes?\n");

  const cssPath = join(ROOT, "app/globals.css");
  if (!existsSync(cssPath)) {
    fail("app/globals.css is missing", "There are no design tokens to check.");
    return;
  }

  const tokens = parseTokens(readFileSync(cssPath, "utf8"));
  let found = 0;

  for (const [mode, set] of [
    ["light", tokens.light],
    ["dark", tokens.dark],
  ]) {
    const block = mode === "light" ? ":root" : ".dark";
    if (Object.keys(set).length === 0) {
      found++;
      fail(
        `No tokens found for ${mode} mode`,
        `app/globals.css should define them in ${block}.`,
      );
      continue;
    }
    for (const [pairs, minimum, kind] of [
      [TEXT_PAIRS, 4.5, "text"],
      [RING_PAIRS, 3, "the focus ring"],
    ]) {
      for (const [fg, bg] of pairs) {
        // A token this app does not use is not a finding. A token it uses and
        // this cannot read is — see below.
        if (!set[fg] || !set[bg]) continue;
        const a = parseHsl(set[fg]);
        const b = parseHsl(set[bg]);
        if (!a || !b) {
          found++;
          warn(
            `--${fg} / --${bg} (${mode}) cannot be read`,
            `Expected hsl(H S% L%), as everything else in the file uses. ` +
              `Nothing is checking this pair.`,
          );
          continue;
        }
        const ratio = contrastRatio(a, b);
        if (ratio < minimum) {
          found++;
          fail(
            `--${fg} on --${bg} (${mode}): ${ratio.toFixed(2)}:1`,
            `WCAG 2.1 AA asks for ${minimum}:1 for ${kind}. Darken or lighten ` +
              `--${fg} in the ${block} block of app/globals.css — and then ` +
              `look at the other mode, which the same change usually breaks.`,
          );
        }
      }
    }
  }

  if (found === 0) ok("Every token pair is legible in light and dark");
}

// ── 2 · The kit, 3 · keyboard, 4 · navigation ────────────────────────────────

function checkSources() {
  const palette = [];
  const raw = [];
  const unnamed = [];
  const noAlt = [];

  for (const file of sourceFiles()) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const hit of findPaletteClasses(source)) palette.push({ file, ...hit });
    for (const hit of findRawElements(source)) raw.push({ file, ...hit });
    for (const hit of findUnnamedIconButtons(source)) unnamed.push({ file, ...hit });
    for (const hit of findImagesWithoutAlt(source)) noAlt.push({ file, ...hit });
  }

  console.log("\nThe kit — is the app using it, or working around it?\n");
  const kit = [
    report(
      palette,
      "Hard-coded colours",
      "These do not follow into dark mode and are missed when the app is " +
        "recoloured. Use the tokens (bg-card, text-muted-foreground, bg-primary).",
    ),
    report(
      raw.filter((h) => h.kind === "hard"),
      "Raw elements the kit already covers",
      "components/ui/ has these, with focus rings, dark mode and consistent " +
        "spacing. Use <Button>, <Input>, <Select>, <Textarea>, <Table>.",
    ),
    report(
      noAlt,
      "Images without alt",
      'Every image needs alt text — alt="" if it is decoration, which is a ' +
        "decision and reads as one.",
    ),
    reportWarning(
      raw.filter((h) => h.kind === "soft"),
      "Controls the kit does not ship",
      "A checkbox, a radio, a segmented control — components/ui/ has none of " +
        "these, so a careful hand-built one is honest work rather than a " +
        "shortcut. It stays yours to keep in step with the rest, and the way " +
        "out is: npx shadcn@latest add checkbox radio-group toggle-group",
    ),
  ].some(Boolean);
  if (!kit) ok("No hand-built elements and no hard-coded colours");

  console.log("\nKeyboard and screen reader\n");
  const named = report(
    unnamed,
    "Icon buttons with no name",
    'A screen reader reads these as "button" and nothing else. Add an ' +
      'aria-label, or a <span className="sr-only"> beside the icon.',
  );
  if (!named) ok("Every icon button has a name");
}

function checkNavigation() {
  console.log("\nNavigation\n");

  const shellPath = join(ROOT, "components/app-shell.tsx");
  if (!existsSync(shellPath)) {
    warn(
      "components/app-shell.tsx is missing",
      "Cannot tell which pages are in the navigation.",
    );
    return;
  }
  const hrefs = navHrefs(readFileSync(shellPath, "utf8"));
  if (hrefs === null) {
    warn(
      "NAVIGATION not found in components/app-shell.tsx",
      "Cannot tell which pages are in the navigation.",
    );
    return;
  }

  const known = new Set(hrefs);
  const orphans = dashboardRoutes(join(ROOT, "app")).filter(
    (route) => !known.has(route),
  );
  if (orphans.length === 0) {
    ok("Every page under /dashboard is in the navigation");
    return;
  }
  fail(
    `Pages that are in no menu (${orphans.length})`,
    `Reachable only by typing the address. One line in NAVIGATION ` +
      `(components/app-shell.tsx), plus the label in BOTH message files:\n     ` +
      orphans.join("\n     "),
  );
}

// ── The run ──────────────────────────────────────────────────────────────────

function main() {
  checkContrast();
  checkSources();
  checkNavigation();

  console.log("");
  if (problems > 0) {
    console.log(
      `❌ ${problems} thing(s) to fix` +
        (warnings > 0 ? `, and ${warnings} worth looking at.` : "."),
    );
    console.log("   The guided path is the skill: ux-gateway\n");
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} thing(s) worth looking at. Nothing blocking.\n`);
    return;
  }
  console.log(
    "✓ Nothing measurable is wrong.\n" +
      "  That means the countable things are counted, not that the app is good —\n" +
      "  the first five minutes, the wording and the dead ends are ux-gateway's.\n",
  );
}

// Run only when this file IS the command. Compared as a resolved path rather
// than by name: three other scripts in this project are also called check.mjs.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
