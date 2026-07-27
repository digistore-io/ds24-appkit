// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The wiring for the four programs this app is built with.
//
// Everything here guards a failure that is INVISIBLE from the inside: a config
// that no longer parses, a plugin that registers a hook nobody calls, a prune
// list that quietly takes the skills with it. None of them produce an error —
// they produce an app that is subtly less than it was, in a program the person
// who released it does not use.
//
// Each test below exists because the thing it checks went wrong once.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AGENTS, GREETER, NODE_PROBE, STUB_TREE, prunedPathsFor } from "./dev/agent-configs.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
type Agent = keyof typeof AGENTS;
const names = Object.keys(AGENTS) as Agent[];

describe("every program's config ships and is intact", () => {
  it.each(names)("%s has its files on disk", (agent) => {
    for (const file of Object.keys(AGENTS[agent].files)) {
      expect(existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
  });

  it.each(names)("%s gets exactly what agent-configs.mjs says", (agent) => {
    // The shipped file is generated from that module (scripts/agent-configs-stamp.mjs
    // in the factory), and agent-setup restores from the same module. If the two
    // ever differ, "put it back" puts back something else.
    for (const [file, content] of Object.entries(AGENTS[agent].files)) {
      expect(read(file), `${file} has drifted from agent-configs.mjs`).toBe(content);
    }
  });

  it("the JSON configs parse", () => {
    for (const file of [".claude/settings.json", ".gemini/settings.json"]) {
      expect(() => JSON.parse(read(file)), `${file} is not valid JSON`).not.toThrow();
    }
  });

  it("every config runs the same greeting, and that file is there", () => {
    // Four different mechanisms, one script. A typo in any of the four is a
    // program that starts silently — and silence reads as "nothing is wrong".
    // Three name the whole command; OpenCode spawns the script itself, so the
    // path is what they all have in common.
    const script = GREETER.replace(/^node\s+/, "");
    for (const agent of names) {
      const mentions = Object.values(AGENTS[agent].files).some((content) =>
        (content as string).includes(script),
      );
      expect(mentions, `${agent} does not start ${script}`).toBe(true);
    }
    expect(existsSync(path.join(ROOT, script)), `${script} is missing`).toBe(true);
  });

  it("the shell probe runs before the greeting, wherever both appear", () => {
    // The probe is the only thing that can report a machine with no Node, so it
    // has to come first. See CLAUDE.md → the greeting.
    for (const { files } of Object.values(AGENTS)) {
      for (const content of Object.values(files) as string[]) {
        if (!content.includes(NODE_PROBE)) continue;
        expect(content.indexOf(NODE_PROBE)).toBeLessThan(content.indexOf(GREETER));
      }
    }
  });
});

describe("the OpenCode plugin", () => {
  // It is the only greeting that is CODE rather than config, so it is the only
  // one that can be syntactically broken or silently register nothing.
  const file = ".opencode/plugins/session-start.js";

  it("parses and exports a plugin function", async () => {
    const plugin = await import(path.join(ROOT, file));
    expect(typeof plugin.SessionGreeting).toBe("function");
  });

  it("registers the session hook under both known shapes", async () => {
    // OpenCode documents hooks keyed by event name; a generic `event` hook is
    // also described in the wild. Registering one and guessing wrong is a
    // greeting that never appears, with nothing in any log to say so.
    const { SessionGreeting } = await import(path.join(ROOT, file));
    const hooks = await SessionGreeting({ directory: ROOT });
    expect(Object.keys(hooks).sort()).toEqual(["event", "session.created"]);
  });

  it("survives a greeting that cannot run", async () => {
    // A plugin that throws in session.created stops somebody from starting
    // work — over a banner.
    const { SessionGreeting } = await import(path.join(ROOT, file));
    const hooks = await SessionGreeting({ directory: path.join(ROOT, "does-not-exist") });
    await expect(hooks["session.created"]()).resolves.not.toThrow();
  });
});

describe("what agent-setup removes", () => {
  it.each(names)("%s never prunes a path that carries the skills", (agent) => {
    // `.claude` instead of `.claude/settings.json` would swallow
    // `.claude/skills/**`. Those are in the knowledge stamp, `node run.mjs
    // update` skips anything the profile calls pruned — and every skill would
    // stop being updated, in every app, with no message anywhere.
    const shared = [
      ".claude/skills/build-app/SKILL.md",
      "CLAUDE.md",
      "AGENTS.md",
      "README.md",
      "docs/updates.md",
      GREETER.replace(/^node\s+/, ""),
    ];
    for (const file of prunedPathsFor(agent)) {
      for (const keep of shared) {
        expect(
          keep === file || keep.startsWith(`${file}/`),
          `setting up for ${agent} would prune ${keep} (via "${file}")`,
        ).toBe(false);
      }
    }
  });

  it.each(names)("%s keeps its own files and drops the others'", (agent) => {
    const pruned = prunedPathsFor(agent);
    for (const own of Object.keys(AGENTS[agent].files)) {
      expect(pruned, `${agent} would prune its own ${own}`).not.toContain(own);
    }
    for (const other of names.filter((name) => name !== agent)) {
      for (const file of Object.keys(AGENTS[other].files)) {
        expect(pruned, `${agent} should not keep ${other}'s ${file}`).toContain(file);
      }
    }
  });

  it("keeps the stub tree exactly for the programs that read it", () => {
    // Codex and Gemini find skills under .agents/skills; Claude Code and
    // OpenCode read .claude/skills directly. Pruning the tree for a program
    // that needs it is a session with no skills at all.
    for (const agent of names) {
      expect(prunedPathsFor(agent).includes(STUB_TREE)).toBe(!AGENTS[agent].stubs);
    }
  });
});
