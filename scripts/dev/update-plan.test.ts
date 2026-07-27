// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The update decides what may be overwritten in somebody else's repo. Every one
// of these cases is a way to get that wrong, and the expensive direction is
// always the permissive one: a file wrongly left alone costs a manual copy, a
// file wrongly overwritten costs whatever the customer had written in it.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { normalizeText, planUpdate, requiresFrom, versionAtLeast, writable } from "./update-plan.mjs";

const action = (plan: ReturnType<typeof planUpdate>, path: string) =>
  plan.find((entry) => entry.path === path)?.action;

describe("normalizeText", () => {
  const sha = (text: string) => createHash("sha256").update(normalizeText(text), "utf8").digest("hex");

  it("hashes the content, not the line endings it is stored with", () => {
    // The whole point. Git for Windows checks out CRLF, and without this every
    // guidance file in such a clone looks "edited in this app" — the update
    // then refuses to write anything, for ever, to somebody who touched nothing.
    expect(sha("# Title\r\n\r\nBody\r\n")).toBe(sha("# Title\n\nBody\n"));
  });

  it("still tells two different texts apart", () => {
    expect(sha("Body\n")).not.toBe(sha("Body!\n"));
  });

  it("changes nothing about an LF file", () => {
    // Which is why re-stamping on Linux or macOS produces the same values.
    const text = "# Title\n\nBody\n";
    expect(normalizeText(text)).toBe(text);
  });
});

describe("versionAtLeast", () => {
  it("compares numerically, not as text", () => {
    // "1.10.0" < "1.9.3" as strings — the bug this exists to avoid.
    expect(versionAtLeast("1.10.0", "1.9.3")).toBe(true);
    expect(versionAtLeast("1.9.3", "1.10.0")).toBe(false);
  });

  it("treats an equal version as sufficient", () => {
    expect(versionAtLeast("0.5.0", "0.5.0")).toBe(true);
  });

  it("pads the shorter side", () => {
    expect(versionAtLeast("2", "2.0.0")).toBe(true);
    expect(versionAtLeast("2.0", "2.0.1")).toBe(false);
  });

  it("does not crash on nonsense", () => {
    expect(versionAtLeast(undefined, "1.0.0")).toBe(false);
  });
});

describe("requiresFrom", () => {
  it("reads the requires line out of the frontmatter", () => {
    expect(requiresFrom('---\nname: x\nrequires: "0.6.0"\n---\n# X')).toBe("0.6.0");
    expect(requiresFrom("---\nrequires: 0.6.0\n---\n")).toBe("0.6.0");
  });

  it("returns null when there is none", () => {
    expect(requiresFrom("---\nname: x\n---\n")).toBeNull();
    expect(requiresFrom("# no frontmatter at all")).toBeNull();
    expect(requiresFrom(undefined)).toBeNull();
  });

  it("does not read a requires line from the body", () => {
    // Prose about the field is not the field.
    expect(requiresFrom("---\nname: x\n---\nrequires: 9.9.9 is what it would say")).toBeNull();
  });
});

describe("planUpdate", () => {
  const codeVersion = "0.5.0";

  it("replaces a file nobody here has touched", () => {
    const plan = planUpdate({
      local: { "CLAUDE.md": { current: "aaa", shipped: "aaa" } },
      remote: { "CLAUDE.md": "bbb" },
      codeVersion,
    });
    expect(action(plan, "CLAUDE.md")).toBe("update");
  });

  it("leaves a file alone that was edited here", () => {
    // The one case that must never be got wrong: somebody wrote their own house
    // rules into CLAUDE.md, and an update would take them away silently.
    const plan = planUpdate({
      local: { "CLAUDE.md": { current: "mine", shipped: "aaa" } },
      remote: { "CLAUDE.md": "bbb" },
      codeVersion,
    });
    expect(action(plan, "CLAUDE.md")).toBe("local-change");
    expect(writable(plan)).toEqual([]);
  });

  it("leaves a file alone that .template-version does not know", () => {
    // No baseline means no way to tell an untouched file from an edited one, and
    // "no idea" has to resolve to "hands off".
    const plan = planUpdate({
      local: { "docs/own-notes.md": { current: "mine", shipped: null } },
      remote: { "docs/own-notes.md": "theirs" },
      codeVersion,
    });
    expect(action(plan, "docs/own-notes.md")).toBe("local-change");
  });

  it("says nothing needs doing when the hashes match", () => {
    const plan = planUpdate({
      local: { "CLAUDE.md": { current: "same", shipped: "same" } },
      remote: { "CLAUDE.md": "same" },
      codeVersion,
    });
    expect(action(plan, "CLAUDE.md")).toBe("unchanged");
    expect(writable(plan)).toEqual([]);
  });

  it("installs a file this copy does not have yet", () => {
    const plan = planUpdate({
      local: {},
      remote: { ".claude/skills/new-skill/SKILL.md": "aaa" },
      codeVersion,
    });
    expect(action(plan, ".claude/skills/new-skill/SKILL.md")).toBe("new");
  });

  it("refuses a skill that needs code this copy does not have", () => {
    // Knowledge without the code behind it is worse than no knowledge: the agent
    // describes the feature and then cannot find a line of it.
    const path = ".claude/skills/future/SKILL.md";
    const plan = planUpdate({
      local: {},
      remote: { [path]: "aaa" },
      content: { [path]: '---\nname: future\nrequires: "0.9.0"\n---\n' },
      codeVersion,
    });
    expect(action(plan, path)).toBe("needs-code");
    expect(plan[0].reason).toContain("0.9.0");
    expect(writable(plan)).toEqual([]);
  });

  it("installs a skill whose requirement this copy meets", () => {
    const path = ".claude/skills/fine/SKILL.md";
    const plan = planUpdate({
      local: {},
      remote: { [path]: "aaa" },
      content: { [path]: '---\nname: fine\nrequires: "0.4.0"\n---\n' },
      codeVersion,
    });
    expect(action(plan, path)).toBe("new");
  });

  it("reports a withdrawn file instead of deleting it", () => {
    const plan = planUpdate({
      local: { ".claude/skills/old/SKILL.md": { current: "aaa", shipped: "aaa" } },
      remote: {},
      codeVersion,
    });
    expect(action(plan, ".claude/skills/old/SKILL.md")).toBe("withdrawn");
    expect(writable(plan)).toEqual([]);
  });

  it("does not report a withdrawn file that is already gone", () => {
    const plan = planUpdate({
      local: { ".claude/skills/old/SKILL.md": { current: null, shipped: "aaa" } },
      remote: {},
      codeVersion,
    });
    expect(plan).toEqual([]);
  });
});

describe("writable", () => {
  it("passes on exactly the new and updated files", () => {
    const plan = planUpdate({
      local: {
        "a.md": { current: "1", shipped: "1" },
        "b.md": { current: "mine", shipped: "1" },
        "c.md": { current: "2", shipped: "2" },
      },
      remote: { "a.md": "9", "b.md": "9", "c.md": "2", "d.md": "9" },
      codeVersion: "0.5.0",
    });
    expect(writable(plan).map((entry: { path: string }) => entry.path)).toEqual(["a.md", "d.md"]);
  });
});
