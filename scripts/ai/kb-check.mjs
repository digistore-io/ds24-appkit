// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Checks the assistant's handbook — format, size, media references and what
// one answer costs.
//
//   node run.mjs kb-check
//
// Three jobs, and the last two are the ones you cannot get anywhere else:
//
//  1. **Format.** Every file under `content/knowledge/` against the rules in
//     `lib/ai/frontmatter.mjs`. `npm run test` fails on the same problems, but
//     it says "expected [] to equal [...]"; this says which file and which line.
//  2. **Media.** Every media reference — frontmatter `media:` and body markers
//     — has to resolve somewhere real BEFORE a release, or the chat offers a
//     card that 404s on a customer (AD-55). Verified the way the route
//     resolves: the shipped tree first, then the configured store, through the
//     same signer the app uses.
//  3. **Money.** The handbook is sent to the model on every question, so its
//     size IS the running cost of the feature. The numbers below turn "the
//     handbook got a bit long" into a figure before the invoice does.
//
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";

import {
  KNOWLEDGE_SECTIONS,
  comparePaths,
  estimateTokens,
  parseFrontmatter,
  validateDoc,
} from "../../lib/ai/frontmatter.mjs";
import {
  KNOWLEDGE_MEDIA_BUCKET_PREFIX,
  KNOWLEDGE_MEDIA_SHIPPED_MAX_BYTES,
  KNOWLEDGE_MEDIA_TYPES,
  MEDIA_MARKER_PATTERN,
  isValidMediaPath,
  markersIn,
} from "../../lib/knowledge-media/rules.mjs";
import { s3SettingsFromEnv, sendS3 } from "../../lib/media/s3-request.mjs";
// The MEDIA_* variables live in the .env — the media pass below verifies
// against whichever store they configure. No .env simply means driver "local",
// which is the honest per-driver answer for a half-set-up project.
import "../lib/env.mjs";
// The walk and the three budgets, from the one file the app reads them from.
// Both were copied here — the walk verbatim under a comment saying it "mirrors
// knowledge.ts", the warn threshold as a bare literal, and the MAXIMUM not at
// all, so this command never reported the one overrun the app flags.
import {
  KNOWLEDGE_MAX_CHARS,
  KNOWLEDGE_MIN_CHARS,
  KNOWLEDGE_WARN_CHARS,
  markdownFilesIn,
  renderedChars,
} from "../../lib/ai/knowledge-files.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KNOWLEDGE = join(ROOT, "content", "knowledge");

/**
 * Indicative list prices per million tokens, so the estimate is a number and
 * not a shrug. Anthropic's published rates; check
 * https://platform.claude.com/docs/en/pricing before quoting them to anybody.
 *
 * A cache READ is about a tenth of the input price — that is the whole reason
 * the handbook is sent whole. A cache WRITE costs more than plain input
 * (1.25x for the 5-minute window, 2x for the hour), and it happens once per
 * window for the WHOLE installation, not once per customer.
 */
const PRICES = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** A typical answer, for the output half of the estimate. */
const ANSWER_TOKENS = 400;

function money(dollars) {
  if (dollars < 0.01) return `${(dollars * 100).toFixed(3)} cents`;
  return `$${dollars.toFixed(3)}`;
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "config", "ai-chat.json"), "utf8"));
  } catch {
    return {};
  }
}

// --- Read ---------------------------------------------------------------------

let exists = false;
try {
  exists = statSync(KNOWLEDGE).isDirectory();
} catch {
  exists = false;
}

if (!exists) {
  console.error(
    "✗ content/knowledge/ does not exist.\n" +
      "  The assistant has nothing to answer from. Start the skill:\n" +
      "  ask Claude Code for 'ai-chat-knowledge'.",
  );
  process.exit(1);
}

const docs = [];
const problems = [];
const mediaDocs = [];

const scan = markdownFilesIn(KNOWLEDGE);
problems.push(...scan.problems);

for (const relative of scan.found) {
  let raw;
  try {
    raw = readFileSync(join(KNOWLEDGE, relative.split("/").join(sep)), "utf8");
  } catch (error) {
    problems.push({ path: relative, problem: `cannot be read: ${String(error)}` });
    continue;
  }
  const result = validateDoc(relative, raw);
  problems.push(...result.problems);
  if (result.doc) {
    docs.push(result.doc);
    // `validateDoc`'s doc deliberately does not carry `media:` — read it off
    // the raw frontmatter (comma-separated, AD-57). A file that failed the
    // format check is skipped here: fix the format first, then the media.
    const media = (parseFrontmatter(raw)?.data.get("media") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    mediaDocs.push({ path: relative, media, markers: markersIn(result.doc.body) });
  }
}

docs.sort((a, b) => comparePaths(a.path, b.path));

// --- Media references (AD-55) ---------------------------------------------
//
// Grammar first, then the cross-check, then existence — a name that violates
// the standard is a problem in its own right, before anybody asks whether a
// file by that name happens to exist. Existence mirrors the route's
// resolution order (18.2): the shipped tree under content/knowledge-media/
// first, then the configured store under `knowledge/<path>` — s3 by a HEAD
// through lib/media/s3-request.mjs (the same signer the app uses), the local
// driver by fs against the store root. There is no "no store" state: the
// local driver IS a store, and an unreachable s3 store is a problem, not a
// SKIP.

const KNOWLEDGE_MEDIA = join(ROOT, "content", "knowledge-media");
const MARKER_RE = new RegExp(MEDIA_MARKER_PATTERN);

/** The path inside one whole marker string — group 1 of the one grammar. */
function markerPath(marker) {
  return marker.match(MARKER_RE)[1];
}

const referenced = new Set();
// Which handbook file to point at when a shared reference is broken — the
// first one that names it is where the fix starts.
const firstDocFor = new Map();
const mediaLines = [];

function reference(path, doc) {
  referenced.add(path);
  if (!firstDocFor.has(path)) firstDocFor.set(path, doc);
}

for (const entry of mediaDocs) {
  const markerPaths = entry.markers.map(markerPath);

  for (const declared of entry.media) {
    if (!isValidMediaPath(declared)) {
      problems.push({
        path: entry.path,
        problem:
          `media: "${declared}" violates the naming standard — ` +
          "<topic-slug>/<file>.<extension>, lowercase a-z, 0-9 and hyphens, " +
          `exactly one folder, extension one of: ${Object.keys(KNOWLEDGE_MEDIA_TYPES).join(", ")}`,
      });
      continue; // a bad name has no existence worth checking
    }
    reference(declared, entry.path);
    // Cross-check, direction one: declared but never offered. A path only in
    // the frontmatter has no marker the assistant could repeat (AD-54), so
    // the customer can never reach it.
    if (!markerPaths.includes(declared)) {
      problems.push({
        path: entry.path,
        problem: `media: lists "${declared}" but no [media:${declared}|…] marker is in the body — the assistant could never offer it`,
      });
    }
  }

  // Direction two: offered but never declared. The frontmatter list is the
  // document's own inventory; a marker missing from it is the drift this
  // cross-check exists to catch. Unique paths, not occurrences — a marker
  // repeated five times in one document is one drift, not five problems.
  for (const found of new Set(markerPaths)) {
    reference(found, entry.path);
    if (!entry.media.includes(found)) {
      problems.push({
        path: entry.path,
        problem: `the body carries [media:${found}|…] but "${found}" is not in the frontmatter media: list`,
      });
    }
  }
}

/**
 * Case-EXACT existence: walk the directory listing segment by segment and
 * compare entry names with `===`, never a bare `statSync` probe. On APFS and
 * NTFS a `statSync("Topic/File.mp4")` happily finds `topic/file.mp4`, so a
 * wrong-case committed name passes this gate on the dev machine and 404s on
 * the case-sensitive Linux deploy — the one place a customer meets it.
 * `statSync` at the end FOLLOWS symlinks on purpose (same policy as the
 * shipped-tree walk below): a symlink to a file is that file.
 */
function fileByExactName(root, relativePath) {
  try {
    const segments = relativePath.split("/");
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      if (!readdirSync(dir).includes(segment)) return false;
      dir = join(dir, segment);
      if (!statSync(dir).isDirectory()) return false;
    }
    const name = segments[segments.length - 1];
    if (!readdirSync(dir).includes(name)) return false;
    return statSync(join(dir, name)).isFile();
  } catch {
    return false;
  }
}

function shippedFile(mediaPath) {
  return fileByExactName(KNOWLEDGE_MEDIA, mediaPath);
}

const driver = (process.env.MEDIA_DRIVER ?? "").trim().toLowerCase() || "local";
let storeLabel = `store driver "${driver}"`;

const pending = [];
for (const ref of [...referenced].sort()) {
  if (shippedFile(ref)) {
    mediaLines.push(`  ✓ ${ref} — shipped (content/knowledge-media/)`);
  } else {
    pending.push(ref);
  }
}

if (driver === "local") {
  const localRoot = resolve(ROOT, process.env.MEDIA_LOCAL_DIR?.trim() || ".data/media");
  storeLabel = `store driver "local" (${localRoot})`;
  for (const ref of pending) {
    const key = KNOWLEDGE_MEDIA_BUCKET_PREFIX + ref;
    // Same case-EXACT walk as the shipped leg, for the same reason: a
    // `statSync` probe on APFS or NTFS finds `knowledge/topic/file.mp4` when
    // the store holds `knowledge/Topic/File.mp4`, so the gate would go green
    // here and the route would 404 on the case-sensitive deploy.
    const inStore = fileByExactName(localRoot, key);
    if (inStore) {
      mediaLines.push(`  ✓ ${ref} — in the local store (${key})`);
    } else {
      mediaLines.push(`  ✗ ${ref} — resolves nowhere`);
      problems.push({
        path: firstDocFor.get(ref),
        problem:
          `references "${ref}" and it resolves nowhere — not in content/knowledge-media/ ` +
          `and not in the local store under ${key}. Put the file in ` +
          `.data/knowledge-media/${ref} and run: node run.mjs kb-media-sync --apply`,
      });
    }
  }
} else if (driver === "s3") {
  const settings = s3SettingsFromEnv();
  storeLabel = settings
    ? `store driver "s3" (bucket "${settings.bucket}" at ${settings.endpoint})`
    : 'store driver "s3" (not configured)';

  if (pending.length > 0) {
    let refused = null;
    if (!settings) {
      refused =
        "MEDIA_DRIVER=s3, but the bucket is not configured. Needs " +
        "MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID and " +
        "MEDIA_S3_SECRET_ACCESS_KEY — see .env.example";
    } else {
      // The endpoint-path trap from media-check: a path segment on the
      // endpoint signs `/bucket/key` while the request sends
      // `/bucket/bucket/key` — every HEAD would answer 403 and read like a
      // missing file, which is the one wrong diagnosis this pass must not make.
      try {
        const url = new URL(settings.endpoint);
        if (url.pathname !== "/" && url.pathname !== "") {
          refused =
            `MEDIA_S3_ENDPOINT is "${settings.endpoint}" — it must be an ORIGIN ` +
            "with no path; the bucket name goes in MEDIA_S3_BUCKET";
        }
      } catch {
        refused = `MEDIA_S3_ENDPOINT is not a URL: "${settings.endpoint}"`;
      }
    }

    if (refused) {
      for (const ref of pending) mediaLines.push(`  ✗ ${ref} — not verified`);
      problems.push({
        path: firstDocFor.get(pending[0]),
        problem:
          `${refused}. ${pending.length} bucket-leg reference(s) cannot be ` +
          `verified: ${pending.join(", ")}`,
      });
    } else {
      // One HEAD per reference, and the first network failure stops the rest:
      // hammering an endpoint that just refused to answer only slows the red
      // gate down. Every unverified path is still a problem — an unreachable
      // store is never a SKIP (AD-55).
      let unreachable = null;
      for (const ref of pending) {
        const key = KNOWLEDGE_MEDIA_BUCKET_PREFIX + ref;
        if (unreachable === null) {
          let head;
          try {
            head = await sendS3(settings, "HEAD", key);
          } catch (error) {
            unreachable = error.message;
          }
          if (head) {
            if (head.ok) {
              mediaLines.push(`  ✓ ${ref} — in the bucket (${key})`);
            } else if (head.status === 404) {
              mediaLines.push(`  ✗ ${ref} — resolves nowhere`);
              problems.push({
                path: firstDocFor.get(ref),
                problem:
                  `references "${ref}" and it resolves nowhere — not in ` +
                  `content/knowledge-media/ and not in the bucket under ${key}. ` +
                  `Put the file in .data/knowledge-media/${ref} and run: ` +
                  "node run.mjs kb-media-sync --apply",
              });
            } else {
              mediaLines.push(`  ✗ ${ref} — HTTP ${head.status}`);
              problems.push({
                path: firstDocFor.get(ref),
                problem: `HEAD ${key} answered HTTP ${head.status} — the store refused the check`,
              });
            }
            continue;
          }
        }
        mediaLines.push(`  ✗ ${ref} — not verified (store unreachable)`);
        problems.push({
          path: firstDocFor.get(ref),
          problem:
            `"${ref}" could not be verified — the bucket is not reachable: ` +
            `${unreachable}. An unreachable store is a problem, not a skip (AD-55)`,
        });
      }
    }
  }
} else if (pending.length > 0) {
  problems.push({
    path: firstDocFor.get(pending[0]),
    problem:
      `MEDIA_DRIVER="${driver}" is not a driver — use "s3", or "local" in ` +
      `development. ${pending.length} bucket-leg reference(s) cannot be ` +
      `verified: ${pending.join(", ")}`,
  });
  for (const ref of pending) mediaLines.push(`  ✗ ${ref} — not verified`);
}

// The whole shipped tree, not only the referenced paths — two questions per
// file, and both are about what SHIPS rather than about what is referenced:
//
//  1. **Size.** A 200 MB video that nothing references yet still travels with
//     every clone and every deploy.
//  2. **The grammar.** A committed name the route could never serve is dead
//     weight that nobody is told about — `kb-media-sync` refuses such a name
//     before it becomes an object key, and the shipped leg deserves the same
//     answer. Otherwise `content/knowledge-media/Topic/Datei (1).mp4` sits in
//     every clone, unservable, and nothing ever says so.
//
// `statSync` FOLLOWS symlinks here, deliberately, and the dirent's own
// `isFile()` is not used: for a symlink a dirent answers false to BOTH
// `isFile()` and `isDirectory()`, so a symlinked 200 MB video would slip past
// the ceiling while `shippedFile()` and the route — which both stat, and so
// both follow — happily serve it. The two functions have to answer "is this
// shipped" identically or the gate is checking a different tree than the app.
function checkShippedTree(dir, prefix = "") {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // no shipped tree is a normal state
  }
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);

    let stats;
    try {
      stats = statSync(full);
    } catch (error) {
      // A dangling symlink, or something the process may not stat. Named, not
      // dropped: an entry that exists in the listing and resolves to nothing
      // is the one state a silent `continue` would hide for ever.
      problems.push({
        path: `content/knowledge-media/${rel}`,
        problem: `cannot be read (${error.code ?? error.message}) — a symlink pointing nowhere?`,
      });
      continue;
    }

    if (stats.isDirectory()) {
      checkShippedTree(full, rel);
      continue;
    }
    if (!stats.isFile()) continue; // a socket or a device is not a media file

    // The namespace grammar, from the one module that owns it (AD-56).
    //
    // Top-level files with a non-media extension are exempt, and that is not
    // laziness: `content/knowledge-media/README.md` is committed on purpose
    // and is unservable BY CONSTRUCTION — uppercase, `.md` is not in the
    // allow-map, and depth 1 is refused anyway. It is documentation for the
    // folder, not a candidate for delivery, and a permanent red problem naming
    // it would train everybody to ignore this check. A top-level file that
    // DOES carry a media extension is still flagged: `intro.mp4` next to the
    // topic folders is a real mistake — it has no topic coordinate and the
    // route cannot serve it.
    const extension = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
    const documentation =
      prefix === "" && !Object.hasOwn(KNOWLEDGE_MEDIA_TYPES, extension);
    if (!documentation && !isValidMediaPath(rel)) {
      problems.push({
        path: `content/knowledge-media/${rel}`,
        problem:
          "violates the naming standard — <topic-slug>/<file>.<extension>, " +
          "lowercase a-z, 0-9 and hyphens, exactly one folder, extension one of: " +
          `${Object.keys(KNOWLEDGE_MEDIA_TYPES).join(", ")}. No handbook marker ` +
          "can ever name it and the route would refuse it — rename it, or take " +
          "it out of the shipped tree",
      });
    }

    if (stats.size > KNOWLEDGE_MEDIA_SHIPPED_MAX_BYTES) {
      problems.push({
        path: `content/knowledge-media/${rel}`,
        problem:
          `is ${(stats.size / 1024 / 1024).toFixed(1)} MB — past the ` +
          `${KNOWLEDGE_MEDIA_SHIPPED_MAX_BYTES / 1024 / 1024} MB ceiling for shipped files. ` +
          `Move it to .data/knowledge-media/${rel} and run ` +
          "node run.mjs kb-media-sync --apply — the reference keeps working, " +
          "served from the store instead of the app tree",
      });
    }
  }
}
checkShippedTree(KNOWLEDGE_MEDIA);

// --- Report -------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`✗ ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    // Media findings under content/knowledge-media/ carry their whole path;
    // everything else names a handbook file under content/knowledge/.
    const where = problem.path.startsWith("content/")
      ? problem.path
      : `content/knowledge/${problem.path}`;
    console.error(`  ${where}`);
    console.error(`    ${problem.problem}\n`);
  }
}

if (docs.length === 0) {
  console.error("✗ No usable document in content/knowledge/.");
  process.exit(1);
}

// What actually lands in the prompt: bodies alone under-report by roughly a
// quarter, because every document also carries a contents line and a fence.
const chars = renderedChars(docs);
const tokens = estimateTokens(chars);

console.log(`Handbook: ${docs.length} document(s), ${chars} characters, about ${tokens} tokens\n`);

for (const section of KNOWLEDGE_SECTIONS) {
  const inSection = docs.filter((doc) => doc.section === section);
  const mark = inSection.length === 0 ? "·" : "✓";
  console.log(`  ${mark} ${section.padEnd(11)} ${inSection.length}`);
  for (const doc of inSection) {
    console.log(`      ${doc.path} — ${doc.title}`);
  }
}

// An empty section is not an error — a product with nothing worth a glossary is
// a normal product. It is worth saying out loud, though, because the usual
// cause is that somebody stopped halfway through the skill.
const empty = KNOWLEDGE_SECTIONS.filter(
  (section) => !docs.some((doc) => doc.section === section),
);
if (empty.length > 0) {
  console.log(`\nℹ Nothing in: ${empty.join(", ")}. Fine if you meant it.`);
}

// Which driver answered is part of the verdict: "the file is there" means
// nothing without saying where "there" was.
if (referenced.size > 0) {
  console.log(`\nMedia: ${referenced.size} reference(s) — ${storeLabel}`);
  for (const line of mediaLines) console.log(line);
}

// --- What it costs ------------------------------------------------------------

const config = readConfig();
// Which model answers is a property of the `chat` TASK, not of the assistant —
// it moved to config/ai-models.json when the provider layer landed. Read from
// there so this estimate quotes the model that will actually run.
const models = JSON.parse(readFileSync(join(ROOT, "config", "ai-models.json"), "utf8"));
const model =
  models?.tasks?.chat?.model ?? models?.default?.model ?? "claude-sonnet-5";
const ttl = config.cacheTtl === "5m" ? "5m" : "1h";
const price = PRICES[model];

console.log("");
if (!price) {
  console.log(`ℹ No price on file for "${model}" — skipping the cost estimate.`);
} else {
  const writeMultiplier = ttl === "1h" ? 2 : 1.25;
  const perAnswer =
    (tokens / 1e6) * price.input * 0.1 + (ANSWER_TOKENS / 1e6) * price.output;
  const perWrite = (tokens / 1e6) * price.input * writeMultiplier;

  console.log(`Cost with ${model}, cache lifetime ${ttl} (list prices, indicative):`);
  console.log(`  one answer, handbook already cached   ~ ${money(perAnswer)}`);
  console.log(`  refreshing the cache, once per ${ttl}     ~ ${money(perWrite)}`);
  console.log(
    "  The refresh is per INSTALLATION, not per customer — the handbook is the\n" +
      "  same bytes for everybody, which is what makes this approach cheap.",
  );
}

if (chars < KNOWLEDGE_MIN_CHARS) {
  console.log(
    `\n⚠ The handbook is only ${chars} characters (about ${tokens} tokens).\n` +
      "  Below roughly 4,096 tokens some providers do not cache the prefix at\n" +
      "  all, and none of them says so — nothing extra is charged, but the\n" +
      "  discount above simply never happens and every answer pays full input\n" +
      "  price. It still works; it is not the cheap path this design assumes.\n" +
      "  See docs/ai-providers.md.",
  );
}

if (chars > KNOWLEDGE_WARN_CHARS) {
  console.log(
    `\n⚠ The handbook is over ${KNOWLEDGE_WARN_CHARS} characters. Still works, but every\n` +
      "  answer now carries it. Consider trimming, or read docs/ai-chat.md on\n" +
      "  swapping the retriever.",
  );
}

// The budget the app itself refuses at. It was flagged in `readKnowledgeFrom`
// and nowhere in this command — so the check an operator is told to run before
// shipping stayed silent about the one size that fails the build.
if (chars > KNOWLEDGE_MAX_CHARS) {
  console.error(
    `\n✗ The handbook is ${chars} characters and the budget is ${KNOWLEDGE_MAX_CHARS}.\n` +
      "  Past this it is not a prompt any more — swap the retriever instead of\n" +
      "  paying to cache a book. See docs/ai-chat.md.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("\n✗ Fix the problems above, then run this again.");
  process.exit(1);
}

console.log("\n✓ The handbook is in order.");
