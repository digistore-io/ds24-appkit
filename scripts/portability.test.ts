// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// This app has to run on Linux, macOS and Windows — Claude Code runs on all
// three, so all three are places where somebody builds their product on it.
// The app code is never the problem; the tooling is. This test is the guard
// that keeps it from quietly rotting back into a Linux-only project.
//
// It checks four things:
//   1. the commands live in .mjs files, not in bash,
//   2. none of the tools from the table in CLAUDE.md → Three systems is used,
//   3. only scripts/lib/proc.mjs decides whether a shell is involved,
//   4. every file ships with LF, and .gitattributes says so.
//
// A finding is not a style complaint: every tool below is genuinely missing or
// genuinely different on one of the three systems, and the replacement is named
// with it.
//
// Comments are stripped before scanning, so a comment may name a tool while
// explaining why it is not used. A line that really has to carry one — a hint
// printed for the user, say — is exempted with the marker `portability-ok`.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const EXEMPT = "portability-ok";

const FORBIDDEN: { pattern: RegExp; tool: string; instead: string }[] = [
  { pattern: /\blsof\b/, tool: "lsof", instead: "portInUse() from scripts/dev/ports.mjs" },
  { pattern: /\bnetstat\b/, tool: "netstat", instead: "portInUse() from scripts/dev/ports.mjs" },
  { pattern: /\bpgrep\b/, tool: "pgrep", instead: "the remembered PID in .dev/, then process.kill(pid, 0)" },
  { pattern: /\bpkill\b/, tool: "pkill", instead: "the remembered PID in .dev/, then process.kill(pid)" },
  { pattern: /\bps\s+-o\s+pgid/, tool: "ps -o pgid=", instead: "process groups do not exist on Windows" },
  { pattern: /\bsetsid\b/, tool: "setsid", instead: 'spawn(…, { detached: true }).unref()' },
  { pattern: /\bnohup\b/, tool: "nohup", instead: 'spawn(…, { detached: true }).unref()' },
  { pattern: /\bsed\s+-i\b/, tool: "sed -i", instead: "setEnvValue() from scripts/lib/env-write.mjs" },
  { pattern: /\bmktemp\b/, tool: "mktemp", instead: "node:fs (mkdtempSync)" },
  { pattern: /\bopenssl\b/, tool: "openssl", instead: "node:crypto" },
  { pattern: /\bcurl\b/, tool: "curl", instead: "fetch() — Node has it built in" },
  { pattern: /\bwget\b/, tool: "wget", instead: "fetch() — Node has it built in" },
  { pattern: /\breadlink\s+-f\b/, tool: "readlink -f", instead: "path.resolve()" },
  { pattern: /\brealpath\b/, tool: "realpath", instead: "path.resolve()" },
  { pattern: /\bdate\s\+%s/, tool: "date +%s", instead: "Date.now()" },
];

/** The folders that hold tooling — everything a developer's machine executes. */
const TOOLING_DIRS = ["scripts"];

/**
 * The session greeting for OpenCode. It lives apart from the rest because
 * OpenCode has no declarative hooks (opencode#14863) and loads plugins as
 * modules — and it is `.js`, not `.mjs`, because that is the extension OpenCode
 * looks for. Same rules apply: it runs on somebody's Linux, macOS or Windows
 * machine, so it may not reach for a shell either.
 */
const PLUGIN_DIRS = [".opencode/plugins"];

/** Every .mjs we ship as tooling, plus run.mjs and the OpenCode plugins. */
function toolingFiles(dir: string, extensions: string[], found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) toolingFiles(full, extensions, found);
    else if (extensions.some((ext) => entry.endsWith(ext))) found.push(full);
  }
  return found;
}

const TOOLING = [
  path.join(ROOT, "run.mjs"),
  ...TOOLING_DIRS.flatMap((dir) => toolingFiles(path.join(ROOT, dir), [".mjs"])),
  ...PLUGIN_DIRS.flatMap((dir) => toolingFiles(path.join(ROOT, dir), [".mjs", ".js"])),
];

/** The one file allowed to know that shells exist. */
const PROC = path.join(ROOT, "scripts", "lib", "proc.mjs");

/** Replace comments with spaces, so line numbers survive and prose does not count. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (m, before: string) => before + " ".repeat(m.length - before.length));
}

describe("the tooling runs on Linux, macOS and Windows", () => {
  it("keeps the commands in run.mjs, not in a Makefile of its own", () => {
    const makefile = readFileSync(path.join(ROOT, "Makefile"), "utf8");
    // The Makefile is an alias and nothing else — every real target is in run.mjs,
    // because `make` is missing on Windows and needs the Xcode CLT on macOS.
    expect(makefile).toContain("node run.mjs");
    const targets = [...makefile.matchAll(/^([a-z0-9-]+):/gm)].map((m) => m[1]);
    expect(targets).toEqual(["help"]);
  });

  it.each(TOOLING_DIRS)("has no shell scripts in %s", (dir) => {
    const shellScripts = readdirSync(path.join(ROOT, dir), { recursive: true })
      .map(String)
      .filter((entry) => entry.endsWith(".sh"));
    // Anything that starts, stops or finds a process belongs in a .mjs script:
    // Node behaves the same on all three systems, a shell does not.
    expect(shellScripts).toEqual([]);
  });

  it.each(TOOLING)("%s uses no Linux-only tools", (file) => {
    const original = readFileSync(file, "utf8").split("\n");
    const code = stripComments(readFileSync(file, "utf8")).split("\n");
    const findings: string[] = [];

    code.forEach((line, index) => {
      if (original[index].includes(EXEMPT)) return;
      for (const { pattern, tool, instead } of FORBIDDEN) {
        if (pattern.test(line)) {
          findings.push(`${path.relative(ROOT, file)}:${index + 1} uses ${tool} — use ${instead}`);
        }
      }
    });

    expect(findings).toEqual([]);
  });

  it.each(TOOLING.filter((file) => file !== PROC))("%s leaves the shell decision to proc.mjs", (file) => {
    const original = readFileSync(file, "utf8").split("\n");
    const code = stripComments(readFileSync(file, "utf8")).split("\n");

    // `shell: true` beside an args array is what Node 24 deprecated (DEP0190),
    // and it concatenates without escaping — which really did truncate a URL at
    // its first `&`. spawnCommand() in scripts/lib/proc.mjs settles the question
    // once, by looking the command up and shelling out only for a .cmd shim.
    // Spread across five files it becomes five judgement calls, four of which
    // nobody on Linux or macOS would ever see go wrong.
    const findings = code
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => /\bshell\s*:/.test(line) && !original[index].includes(EXEMPT))
      .map(({ index }) => `${path.relative(ROOT, file)}:${index + 1} passes a shell option — use spawnCommand()/run()/capture() from scripts/lib/proc.mjs`);

    expect(findings).toEqual([]);
  });
});

// ── line endings ────────────────────────────────────────────────────────────
//
// Git for Windows checks out CRLF by default. Two things break silently on such
// a clone, and neither of them announces itself:
//
//   * scripts/lib/env-write.mjs read every .env key back as "not set",
//   * `node run.mjs update` classified every guidance file as "edited in this
//     app", because the hashes in .template-version are taken over LF content.
//
// .gitattributes is what stops it, and it is one file that a refactor could
// delete without anybody developing on Linux ever noticing.

/** Everything shipped, minus what is generated or genuinely binary. */
function shippedFiles(dir: string, found: string[] = []): string[] {
  const SKIP = new Set([".git", "node_modules", ".next", ".dev", "dist", "out"]);
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) shippedFiles(full, found);
    else if (!/\.(png|jpg|jpeg|gif|ico|woff2?|pdf|zip)$/i.test(entry)) found.push(full);
  }
  return found;
}

describe("everything ships with LF line endings", () => {
  it("declares it in .gitattributes, for all three systems", () => {
    const attributes = readFileSync(path.join(ROOT, ".gitattributes"), "utf8");
    // Without `eol=lf` the local git config decides, and on Windows it decides
    // CRLF. `text=auto` alone normalises the index, not the working tree.
    expect(attributes).toMatch(/^\*\s+text=auto\s+eol=lf$/m);
  });

  it("has no file with CRLF in it", () => {
    const offenders = shippedFiles(ROOT)
      .filter((file) => readFileSync(file, "utf8").includes("\r\n"))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("has no file with a raw NUL byte in it", () => {
    // A control byte in a source file makes git treat it as BINARY — no
    // reviewable diff, no textual merge, grep answers "Binary file matches",
    // and the LF normalisation above never runs. It happened once: a
    // string-delimiter was written as the literal byte instead of the
    // \u0000 escape, and every gate stayed green while the public mirror
    // shipped an undiffable module. This is the gate that was missing.
    const offenders = shippedFiles(ROOT)
      .filter((file) => readFileSync(file, "utf8").includes("\u0000"))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
