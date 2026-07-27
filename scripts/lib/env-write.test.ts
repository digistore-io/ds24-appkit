// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The .env reader and writer, against real files on disk.
//
// Everything here runs twice — once with LF and once with CRLF — because the
// .env is the one file .gitattributes cannot reach: it is gitignored, so it
// never passes through the index, and on Windows it is routinely written by an
// editor that ends its lines with `\r\n`.
//
// That gap was not theoretical. The read pattern was anchored with `$`, which
// never matches a line ending in `\r`, so on a Windows machine EVERY key read
// back as "not set" — and `ensure-env.mjs` then minted a fresh AUTH_SECRET on
// every single run, signing everybody out. The write pattern used `\s*`, which
// matches a newline, so replacing a value ate the line break in front of it and
// ran two lines into one. Both are asserted below.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commentEnvValue, readEnvValue, seedEnvFile, setEnvValue } from "./env-write.mjs";

const LINES = [
  "# Basics",
  "APP_URL=http://localhost:3000",
  "AUTH_SECRET=geheim",
  "# DB_PORT=15432",
  "DB_DRIVER=local",
  "QUOTED=\"in quotes\"",
];

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ds24-env-"));
  file = path.join(dir, ".env");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Write the fixture with the given line ending. */
function fixture(eol: string) {
  writeFileSync(file, LINES.join(eol) + eol);
}

const read = () => readFileSync(file, "utf8");

describe.each([
  ["LF (Linux, macOS)", "\n"],
  ["CRLF (Windows)", "\r\n"],
])("a .env with %s line endings", (_label, eol) => {
  beforeEach(() => fixture(eol));

  it("reads every key", () => {
    expect(readEnvValue(file, "APP_URL")).toBe("http://localhost:3000");
    expect(readEnvValue(file, "AUTH_SECRET")).toBe("geheim");
    expect(readEnvValue(file, "DB_DRIVER")).toBe("local");
  });

  it("strips surrounding quotes", () => {
    expect(readEnvValue(file, "QUOTED")).toBe("in quotes");
  });

  it("does not count a commented-out line as set", () => {
    expect(readEnvValue(file, "DB_PORT")).toBe("");
  });

  it("reads the last line when a key appears twice", () => {
    writeFileSync(file, `APP_URL=first${eol}APP_URL=second${eol}`);
    expect(readEnvValue(file, "APP_URL")).toBe("second");
  });

  it("replaces a value without touching any other line", () => {
    setEnvValue(file, "AUTH_SECRET", "neu");
    expect(read().split("\n")).toEqual([
      "# Basics",
      "APP_URL=http://localhost:3000",
      "AUTH_SECRET=neu",
      "# DB_PORT=15432",
      "DB_DRIVER=local",
      'QUOTED="in quotes"',
      "",
    ]);
  });

  it("fills in a commented-out template line in place", () => {
    setEnvValue(file, "DB_PORT", "15433");
    expect(readEnvValue(file, "DB_PORT")).toBe("15433");
    expect(read()).toContain("DB_PORT=15433");
    // In place — the line does not get appended at the end as well.
    expect(read()).not.toContain("# DB_PORT=15432");
    expect(read().split("\n").filter(Boolean)).toHaveLength(LINES.length);
  });

  it("appends a new key on its own line, with no blank line before it", () => {
    setEnvValue(file, "CRON_SECRET", "abc");
    setEnvValue(file, "SECOND", "x");
    expect(read().split("\n").slice(-3)).toEqual(["CRON_SECRET=abc", "SECOND=x", ""]);
  });

  it("comments a key out so it counts as not set", () => {
    commentEnvValue(file, "DB_DRIVER");
    expect(read()).toContain("# DB_DRIVER=local");
    expect(readEnvValue(file, "DB_DRIVER")).toBe("");
  });

  it("round-trips: what was written is what is read back", () => {
    setEnvValue(file, "DATABASE_URL", "postgresql://app:app@localhost:15432/app");
    expect(readEnvValue(file, "DATABASE_URL")).toBe("postgresql://app:app@localhost:15432/app");
  });

  it("leaves the file as pure LF, with no stray carriage return anywhere", () => {
    setEnvValue(file, "AUTH_SECRET", "neu");
    setEnvValue(file, "CRON_SECRET", "abc");
    commentEnvValue(file, "DB_DRIVER");
    // A lone `\r` is what the old writer produced when it ate the newline in
    // front of the line it was replacing — two settings on one line.
    expect(read()).not.toMatch(/\r/);
    expect(read().split("\n").filter(Boolean)).toHaveLength(LINES.length + 1);
  });
});

describe("creating the file from .env.example", () => {
  /** setEnvValue and seedEnvFile both seed from a RELATIVE ".env.example". */
  function withExample(content: string, run: () => void) {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      writeFileSync(path.join(dir, ".env.example"), content);
      run();
    } finally {
      process.chdir(cwd);
    }
  }

  it("normalises a CRLF example into an LF .env", () => {
    // This is how the problem travelled: .env.example IS tracked, so a Windows
    // checkout hands it CRLF, and the .env used to be a byte-for-byte copy.
    withExample("APP_URL=http://x\r\nAUTH_SECRET=\r\n", () => {
      expect(seedEnvFile(".env")).toBe(true);
      expect(readFileSync(".env", "utf8")).toBe("APP_URL=http://x\nAUTH_SECRET=\n");
    });
  });

  it("does not touch a .env that is already there", () => {
    withExample("APP_URL=http://x\n", () => {
      writeFileSync(".env", "APP_URL=mine\n");
      expect(seedEnvFile(".env")).toBe(false);
      expect(readEnvValue(".env", "APP_URL")).toBe("mine");
    });
  });

  it("setEnvValue creates it too, and the result is readable", () => {
    withExample("APP_URL=http://x\r\n# AUTH_SECRET=\r\n", () => {
      setEnvValue(".env", "AUTH_SECRET", "abc");
      expect(readFileSync(".env", "utf8")).not.toMatch(/\r/);
      expect(readEnvValue(".env", "AUTH_SECRET")).toBe("abc");
      expect(readEnvValue(".env", "APP_URL")).toBe("http://x");
    });
  });
});

describe("edge cases", () => {
  it("returns empty for a file that is not there", () => {
    expect(readEnvValue(path.join(dir, "nope"), "APP_URL")).toBe("");
  });

  it("survives an empty file", () => {
    writeFileSync(file, "");
    setEnvValue(file, "APP_URL", "http://x");
    expect(readFileSync(file, "utf8")).toBe("APP_URL=http://x\n");
  });

  it("repairs a file the old writer ran two lines into one on", () => {
    // "A=1\rB=2" — a bare CR, which is what `\s*` in the old pattern left behind.
    writeFileSync(file, "APP_URL=http://x\rAUTH_SECRET=geheim\n");
    expect(readEnvValue(file, "AUTH_SECRET")).toBe("geheim");
    setEnvValue(file, "APP_URL", "http://y");
    expect(readFileSync(file, "utf8")).toBe("APP_URL=http://y\nAUTH_SECRET=geheim\n");
  });

  it("does not write when there is nothing to comment out", () => {
    mkdirSync(path.join(dir, "sub"));
    const missing = path.join(dir, "sub", ".env");
    commentEnvValue(missing, "APP_URL"); // must not throw or create the file
    expect(() => readFileSync(missing, "utf8")).toThrow();
  });
});
