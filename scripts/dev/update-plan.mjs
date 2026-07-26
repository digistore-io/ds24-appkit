// What may an update touch, and what must it leave alone?
//
// This app is a COPY of a template that keeps being worked on. The code is the
// customer's from the moment they clone it, but the guidance is not: CLAUDE.md,
// the docs and the skills under `.claude/skills/` are how the agent knows what
// the app can do, and a copy of them from six months ago is how an agent ends up
// rebuilding by hand a feature that shipped in the meantime.
//
// So `node run.mjs update` refreshes the TEXT and never the code. Text cannot
// conflict with the pages somebody built; a lib/ file can.
//
// Everything difficult about that is one question — has this file been changed
// HERE? — and it is why `.template-version` records a hash per file as shipped:
//
//   current === shipped   the customer never touched it → safe to replace
//   current !== shipped   somebody edited it here → hands off, say so
//
// Getting that wrong in the permissive direction silently deletes the
// guardrails, house rules and hard-won notes that somebody wrote into their own
// CLAUDE.md — the single most valuable file in their repo. When in doubt this
// module refuses.
//
// Pure on purpose: no fetch, no fs, no clock. The shell around it is update.mjs.

/** `"1.10.0"` >= `"1.9.3"` — numerically, not as a string. */
export function versionAtLeast(have, want) {
  const parse = (v) =>
    String(v ?? "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(have), parse(want)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

/**
 * The `requires:` line from a skill's frontmatter, or `null` when it has none.
 *
 * A skill may need code that this copy does not have. Landing it anyway would be
 * the worst of both worlds: the agent reads a confident description of a feature
 * and then cannot find any of it.
 */
export function requiresFrom(text) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
  if (!frontmatter) return null;
  const requires = /^requires:\s*"?([0-9]+(?:\.[0-9]+)*)"?\s*$/m.exec(frontmatter[1]);
  return requires ? requires[1] : null;
}

/**
 * Decide what happens to every file the remote manifest offers, plus the ones it
 * no longer has.
 *
 * @param local   {path: {current: sha|null, shipped: sha|null}} — `current` is
 *                null when the file is not on disk here.
 * @param remote  {path: sha} — the manifest from the site.
 * @param content {path: text} — only needed to read a skill's `requires:`;
 *                pass `{}` while planning without the bundle in hand.
 * @param codeVersion the version of the CODE in this copy (package.json).
 *
 * @returns entries `{ path, action, reason? }` with action one of:
 *   `new` | `update` | `unchanged` | `local-change` | `needs-code` | `withdrawn`
 */
export function planUpdate({ local, remote, content = {}, codeVersion }) {
  const plan = [];

  for (const [path, sha] of Object.entries(remote)) {
    const here = local[path] ?? { current: null, shipped: null };

    const requires = requiresFrom(content[path]);
    if (requires && !versionAtLeast(codeVersion, requires)) {
      // Not a failure and not something the customer can fix by trying again:
      // the text belongs to code this copy does not carry.
      plan.push({
        path,
        action: "needs-code",
        reason: `needs template ${requires}, this app is ${codeVersion}`,
      });
      continue;
    }

    if (here.current === null) {
      plan.push({ path, action: "new" });
      continue;
    }
    if (here.current === sha) {
      plan.push({ path, action: "unchanged" });
      continue;
    }
    if (here.shipped === null || here.current !== here.shipped) {
      plan.push({
        path,
        action: "local-change",
        reason: here.shipped === null ? "not in .template-version" : "edited in this app",
      });
      continue;
    }
    plan.push({ path, action: "update" });
  }

  // Files this copy has and the template no longer ships. Reported, never
  // deleted: a skill we withdrew may be the one somebody built their week on.
  for (const [path, here] of Object.entries(local)) {
    if (path in remote || here.current === null) continue;
    plan.push({ path, action: "withdrawn" });
  }

  return plan;
}

/** The paths an `--apply` would actually write. */
export function writable(plan) {
  return plan.filter((entry) => entry.action === "new" || entry.action === "update");
}
