// Reading one handbook file — the format itself, in plain JavaScript.
//
// ── Why this one file is .mjs in a TypeScript project ──────────────────────
// Two very different things have to agree on this format: the app
// (`lib/ai/knowledge.ts`, running inside Next.js) and the command line
// (`scripts/ai/kb-check.mjs`, plain Node, no bundler, no TypeScript). The
// scripts in this repo deliberately do not import the app's TypeScript — see
// CLAUDE.md, "Three systems" — so the alternative was to write the parser
// twice and let the two drift until `kb-check` says a file is fine and the app
// says it is not.
//
// So the rules live here once, in the one language both can read, and
// `lib/ai/knowledge.ts` puts the types back on at the boundary.
//
// Keep it dependency-free and keep it pure: it is imported by a Next.js server
// bundle and by a bare `node scripts/…` on Windows alike.

/**
 * The four sections, and the order they are presented in.
 *
 * Fixed rather than free-form: the sections are a promise to the reader about
 * what kind of answer they get, and the skill `ai-chat-knowledge` writes into
 * exactly these.
 *
 *   onboarding — the first way through the app, for somebody who just arrived
 *   reference  — feature by feature: what it is, what it does, what it costs
 *   howto      — task by task: the steps to get one specific thing done
 *   glossary   — term by term, for the words this product uses oddly
 */
export const KNOWLEDGE_SECTIONS = ["onboarding", "reference", "howto", "glossary"];

/**
 * The `key: value` block between the leading `---` fences.
 *
 * A deliberate subset of YAML — no nesting, no lists, no multi-line values.
 * Enough for the four fields the format defines, and it costs no dependency.
 *
 * Returns null when the file does not open with a fence, or opens one and never
 * closes it. Both are the same mistake from the writer's point of view and both
 * get the same message in `validateDoc`.
 *
 * @param {string} raw
 * @returns {{ data: Map<string, string>, body: string } | null}
 */
export function parseFrontmatter(raw) {
  // A byte-order mark in front of the fence is invisible in every editor and
  // would otherwise make the file "not start with ---". Compared by code point
  // rather than written out, because the character itself is invisible here too.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const data = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      return { data, body: lines.slice(i + 1).join("\n").trim() };
    }
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // Quotes are optional; a summary containing a colon needs them.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") data.set(key, value);
  }

  return null;
}

/**
 * One file, checked against the format the skill writes.
 *
 * Every refusal is a sentence rather than a code, and deliberately so: the
 * audience is whoever runs `node run.mjs kb-check`, there is exactly one of
 * them, and they need to know which line to fix — not a key to look up.
 *
 * @param {string} path  path below content/knowledge, forward slashes
 * @param {string} raw
 * @returns {{ doc: object | null, problems: Array<{ path: string, problem: string }> }}
 */
export function validateDoc(path, raw) {
  const problems = [];
  const fail = (problem) => {
    problems.push({ path, problem });
    return { doc: null, problems };
  };

  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    return fail(
      'no frontmatter — the file must start with a "---" line and close it with another',
    );
  }

  const section = parsed.data.get("section");
  if (!KNOWLEDGE_SECTIONS.includes(section)) {
    return fail(
      `"section" must be one of: ${KNOWLEDGE_SECTIONS.join(", ")} (found: ${
        section === undefined ? "nothing" : `"${section}"`
      })`,
    );
  }

  const title = (parsed.data.get("title") ?? "").trim();
  if (title === "") return fail('"title" is missing or empty');
  if (title.length > 120) return fail('"title" is longer than 120 characters');

  const summary = (parsed.data.get("summary") ?? "").trim();
  // The summary is not decoration: it is what the model sees in the table of
  // contents before it decides which document answers the question. A file
  // without one gets found by accident or not at all.
  if (summary === "") {
    return fail('"summary" is missing — one sentence, what is in here');
  }
  if (summary.length > 300) return fail('"summary" is longer than 300 characters');

  const updated = (parsed.data.get("updated") ?? "").trim();
  if (updated !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
    return fail('"updated" must be a day in the form 2026-07-24');
  }

  if (parsed.body === "") return fail("the file has frontmatter but no content");

  // The title lives in the frontmatter, so a body-level H1 would render twice
  // in the prompt and compete with it. Sections start at `##`.
  if (/^#\s/m.test(parsed.body)) {
    return fail(
      'the body must not use "# " — the title comes from the frontmatter, start at "## "',
    );
  }

  return {
    doc: {
      path,
      section,
      title,
      summary,
      updated: updated === "" ? null : updated,
      body: parsed.body,
    },
    problems,
  };
}

/**
 * Order two document paths — deterministically, on any machine.
 *
 * Plain code-unit comparison. NOT `localeCompare`, which reads the host's
 * locale and orders "Ä" before or after "B" depending on it. The handbook is
 * concatenated in this order into a CACHED prompt prefix that is matched byte
 * for byte, so two machines that disagree here share no cache — and the only
 * symptom is a bill that quietly doubles.
 *
 * @param {string} a
 * @param {string} b
 */
export function comparePaths(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Roughly how many characters make one token, for German and English prose.
 *
 * An estimate on purpose. The exact number is model-specific and only the API
 * can give it; asking would turn `npm run test` into a billable network call.
 * The authoritative number is `usage` on the API response, which
 * `app/api/chat/route.ts` logs on every answer.
 */
export const CHARS_PER_TOKEN = 3.5;

/** @param {number} chars */
export function estimateTokens(chars) {
  return Math.round(chars / CHARS_PER_TOKEN);
}
