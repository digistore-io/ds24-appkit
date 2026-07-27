// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Read and write single keys in a .env file — shared by the ds24 setup scripts
// (connect-api-key, ipn-setup), the start-up scripts and mail-setup, so that
// there is exactly one .env writer.
//
// Behaviour on write: replace an existing line (a commented-out template
// `# KEY=` too), otherwise append. The rest of the file stays untouched
// (comments included). If the file is missing, it is created from .env.example.
//
// Deliberately not `sed -i`: GNU wants no argument there, BSD/macOS wants one,
// and Git Bash on Windows brings its own surprises. See CLAUDE.md → Three systems.
//
// **Everything here works line by line on LF, and writes LF.** The .env is the
// one file .gitattributes cannot reach — it is gitignored, so it never passes
// through the index and may well have been written by an editor on Windows. Two
// bugs came out of not doing this: a regex anchored with `$` never matched a
// line ending in `\r` (so every key read back as "not set", and AUTH_SECRET was
// regenerated on every run), and `\s*` in the write pattern ate the newline of
// the *preceding* line and ran two lines into one. Normalising once on the way
// in leaves exactly one state to reason about, and on Linux and macOS it is a
// no-op.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const EXAMPLE = ".env.example";

/**
 * The file as lines, with Windows (and stray classic-Mac) line endings taken
 * out. A lone `\r` is not hypothetical here — the old writer produced them.
 */
function readLines(file) {
  return readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n");
}

/** Drop the empty strings a trailing newline leaves behind. Mutates. */
function dropTrailingBlanks(lines) {
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Write lines back, LF, with exactly one newline at the end. */
function writeLines(file, lines) {
  const body = dropTrailingBlanks([...lines]);
  writeFileSync(file, body.length > 0 ? `${body.join("\n")}\n` : "");
}

/**
 * Create the file from .env.example when it is not there yet.
 *
 * The example gives the CONTENT, not the line endings of the machine it was
 * checked out on — so it is normalised on the way in. Otherwise a Windows
 * checkout hands its CRLF straight on to the .env, which is exactly how the
 * problem got in.
 */
export function seedEnvFile(file) {
  if (existsSync(file)) return false;
  const content = existsSync(EXAMPLE) ? readFileSync(EXAMPLE, "utf8").replace(/\r\n?/g, "\n") : "";
  writeFileSync(file, content);
  return true;
}

/**
 * The value of a `KEY=…` line, or "" if the file or the key is missing.
 * A commented-out line does not count — it is not set. The last matching line
 * wins, which is what a shell reading the file would see too.
 */
export function readEnvValue(file, key) {
  if (!existsSync(file)) return "";
  const re = new RegExp(`^[ \\t]*${key}=(.*)$`);
  let value = "";
  for (const line of readLines(file)) {
    const m = re.exec(line);
    if (m) value = m[1];
  }
  value = value.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

export function setEnvValue(file, key, value) {
  if (seedEnvFile(file)) console.log(`→ ${file} created from ${EXAMPLE}.`);

  const lines = readLines(file);
  // `[ \t]*` and not `\s*`: `\s` matches a newline, and a pattern that may span
  // a line break joins the line before this one onto it.
  const re = new RegExp(`^[ \\t]*#?[ \\t]*${key}=`);
  // The LAST match wins — the same line readEnvValue() reads back.
  let index = -1;
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) index = i;

  // Append AFTER the trailing newline's empty string, not behind it — otherwise
  // every appended key arrives one blank line further down than the last.
  if (index === -1) dropTrailingBlanks(lines).push(`${key}=${value}`);
  else lines[index] = `${key}=${value}`;

  writeLines(file, lines);
}

/**
 * Comment a key out — `KEY=…` becomes `# KEY=…`, so it counts as not set.
 *
 * Every active line for that key, not only the first: this is how mail-setup
 * makes sure two transports are never configured at once, and a leftover second
 * line would defeat that.
 */
export function commentEnvValue(file, key) {
  if (!existsSync(file)) return;
  const re = new RegExp(`^[ \\t]*${key}=`);
  const lines = readLines(file);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    lines[i] = `# ${lines[i]}`;
    changed = true;
  }
  if (changed) writeLines(file, lines);
}
