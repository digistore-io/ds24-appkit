// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// This app has to run on Linux, macOS and Windows — Claude Code runs on all
// three, so all three are places where somebody builds their product on it.
// The app code is never the problem; the tooling is. This test is the guard
// that keeps it from quietly rotting back into a Linux-only project.
//
// It checks two things:
//   1. the commands live in .mjs files, not in bash,
//   2. none of the tools from the table in CLAUDE.md → Three systems is used.
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
const TOOLING_DIRS = ["scripts", ".claude/hooks"];

/** Every .mjs we ship as tooling, plus run.mjs. */
function toolingFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) toolingFiles(full, found);
    else if (entry.endsWith(".mjs")) found.push(full);
  }
  return found;
}

const TOOLING = [
  path.join(ROOT, "run.mjs"),
  ...TOOLING_DIRS.flatMap((dir) => toolingFiles(path.join(ROOT, dir))),
];

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
});
