// Does the app's own notebook know what has been built?
//
// `docs/app.md` is the one file that describes THIS app — not the template.
// CLAUDE.md holds the rules everybody gets; `docs/app.md` holds what was built
// on top of them, one entry per feature. It matters because a session is short
// and a project is not: the agent that adds the fifth feature was not there for
// the first four, and what it does not find written down, it invents again.
//
// So this asks the cheapest possible question — is every page that was built
// mentioned in the notes? — and it asks it by CONTENT, never by file dates. A
// fresh `git clone` writes today's timestamp onto every file, so an mtime
// comparison would announce that notes written months ago are out of date.
//
// A missing mention is a hint, not an error: somebody may be in the middle of
// building. The greeting says it once per session (.claude/hooks/session-start.mjs)
// and CLAUDE.md → "Adding a feature" makes it step 8.

/** The notes file, or `null` when there is none yet. Never throws. */
export function readNotes(read) {
  try {
    return read("docs/app.md");
  } catch {
    return null;
  }
}

/** Regex-safe: a folder may be called `[id]` or `(marketing)`. */
function escape(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The pages from `pages` that `notes` does not mention.
 *
 * Matched on a word boundary, so a page `report` is not counted as covered by a
 * paragraph about `reports` — the near-miss is the case worth catching, because
 * it reads as covered to everybody skimming.
 */
export function unwrittenPages(pages, notes) {
  if (pages.length === 0) return [];
  if (notes === null) return [...pages];
  return pages.filter(
    (name) => !new RegExp(`(^|[^a-z0-9_-])${escape(name)}([^a-z0-9_-]|$)`, "i").test(notes),
  );
}
