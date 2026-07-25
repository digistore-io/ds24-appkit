// The guarantees the setup rests on.
//
// `portability.test.ts` next door keeps the tooling free of Linux-only
// commands. This file keeps the *setup* honest, and it guards three things that
// each break silently and only on a machine nobody here owns:
//
//   1. every tool has an install instruction for all three systems,
//   2. the skill carries no install commands of its own — it reads them,
//   3. both database drivers are handled everywhere the database is touched.
//
// All three are the kind of mistake that passes review, passes the tests that
// exist, and then greets one Windows user with a dead end.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FIXES, PLATFORMS, fixLine } from "./dev/doctor.mjs";
import { DB_DRIVERS } from "./db/driver.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("every tool can be installed on all three systems", () => {
  it.each(Object.keys(FIXES))("%s has an entry per platform", (tool) => {
    const fix = FIXES[tool as keyof typeof FIXES] as Record<string, unknown>;
    expect(Object.keys(fix).sort()).toEqual([...PLATFORMS].sort());
  });

  it.each(Object.keys(FIXES))("%s says something usable on every platform", (tool) => {
    const fix = FIXES[tool as keyof typeof FIXES] as Record<string, object>;
    // A command, a link or at the very least a sentence — an empty entry looks
    // handled in the table and reads as "missing, no idea" on the machine.
    for (const platform of PLATFORMS) {
      expect(fixLine(fix[platform]), `${tool} on ${platform}`).not.toEqual("");
    }
  });
});

describe("the setup skill reads the commands, it does not know them", () => {
  const skill = read(".claude/skills/setup-machine/SKILL.md");

  // Why this is a test and not a note in the file: the moment the skill carries
  // its own `brew install …`, there are two tables. The one in doctor.mjs gets
  // maintained because commands run through it; the copy in the prose does not,
  // and it is the copy the agent reads out to the user.
  const INSTALLERS = [
    /\bbrew\s+install\b/,
    /\bwinget\s+install\b/,
    /\bapt(-get)?\s+install\b/,
    /\bdnf\s+install\b/,
    /\bpacman\s+-S\b/,
    /\bxcode-select\b/,
    /\bnpm\s+install\s+-g\b/,
    // A pipe from the network into a shell — never, and least of all out of prose.
    /\|\s*(ba)?sh\b/,
  ];

  it.each(INSTALLERS.map((re) => [String(re), re] as const))(
    "contains no %s",
    (_label, pattern) => {
      expect(skill).not.toMatch(pattern);
    },
  );

  it("points at doctor --json as its source", () => {
    expect(skill).toContain("node run.mjs doctor --json");
  });
});

describe("both database drivers are handled", () => {
  it("knows exactly docker and local", () => {
    expect(DB_DRIVERS).toEqual(["docker", "local"]);
  });

  // Every place that starts, stops or wipes the database has to branch — one
  // that forgets reaches for `docker compose` on a machine that has no Docker,
  // which is the single thing DB_DRIVER=local exists to avoid.
  it.each([
    ["scripts/db/up.mjs", "usesLocalPostgres"],
    ["scripts/dev/app.mjs", "usesLocalPostgres"],
    ["run.mjs", "usesLocalPostgres"],
  ])("%s branches on the driver", (file, marker) => {
    expect(read(file)).toContain(marker);
  });

  it.each(["run.mjs", "scripts/dev/app.mjs"])(
    "leaves no bare `docker compose` in %s outside a branch",
    (file) => {
      // A compose call has to sit inside the driver branch. The branch may be a
      // line above or below it (`if (…) … else await docker(…)`), so the test
      // looks at the neighbourhood rather than the single line.
      const lines = read(file).split("\n");
      const offenders = lines
        .map((line, index) => [index + 1, line] as const)
        .filter(([, line]) => /(docker\(|"docker",)\s*\[?\s*"compose"/.test(line))
        .filter(
          ([number]) =>
            !lines.slice(Math.max(0, number - 4), number + 2).join("\n").includes("usesLocalPostgres"),
        );
      expect(offenders).toEqual([]);
    },
  );

  it("ships no embedded Postgres by default", () => {
    // It is fetched on demand by whoever needs it. As a dependency it would cost
    // every user ~60 MB, including the majority who run Docker and never touch it.
    const pkg = JSON.parse(read("package.json"));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(declared)).not.toContain("embedded-postgres");
  });
});
