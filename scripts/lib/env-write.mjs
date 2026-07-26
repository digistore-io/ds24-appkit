// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Read and write single keys in a .env file — shared by the ds24 setup scripts
// (connect-api-key, ipn-setup) and by the start-up scripts, so that there is
// exactly one .env writer.
//
// Behaviour on write: replace an existing line (a commented-out template
// `# KEY=` too), otherwise append. The rest of the file stays untouched
// (comments included). If the file is missing, it is created from .env.example.
//
// Deliberately not `sed -i`: GNU wants no argument there, BSD/macOS wants one,
// and Git Bash on Windows brings its own surprises. See CLAUDE.md → Three systems.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * The value of a `KEY=…` line, or "" if the file or the key is missing.
 * A commented-out line does not count — it is not set. The last matching line
 * wins, which is what a shell reading the file would see too.
 */
export function readEnvValue(file, key) {
  if (!existsSync(file)) return "";
  const re = new RegExp(`^[ \\t]*${key}=(.*)$`);
  let value = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = re.exec(line);
    if (m) value = m[1];
  }
  value = value.trim().replace(/\r$/, "");
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

export function setEnvValue(file, key, value) {
  if (!existsSync(file)) {
    if (existsSync(".env.example")) {
      writeFileSync(file, readFileSync(".env.example", "utf8"));
      console.log("→ .env created from .env.example.");
    } else {
      writeFileSync(file, "");
    }
  }
  const content = readFileSync(file, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  const updated = re.test(content)
    ? content.replace(re, line)
    : content.replace(/\n*$/, "\n") + line + "\n";
  writeFileSync(file, updated);
}
