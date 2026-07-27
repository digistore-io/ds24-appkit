// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The parts of scripts/lib/proc.mjs that can be measured rather than trusted.
//
// The Windows branch of `spawnCommand()` never runs on the machine this test
// suite is usually executed on, which is exactly why the decisions it makes are
// pulled out into two pure functions: `cmdQuote()` and `cmdLine()` behave the
// same on all three systems, so the quoting can be held in place from Linux.
//
// What is deliberately NOT asserted here: that npm actually starts through
// cmd.exe. That needs a Windows machine, and pretending otherwise would be the
// same mistake as counting a 307 as a passing page.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { cmdLine, cmdQuote, whichCommand } from "./proc.mjs";

describe("an argument on its way to cmd.exe", () => {
  // Everything this template actually passes is a plain token. It has to come
  // out the other side untouched — a stray pair of quotes around `run` would
  // make npm look for a script by that name including the quotes.
  it.each(["run", "typecheck", "install", "--save-dev", "db:migrate", "whoami", "embedded-postgres@16.14.0-beta.17"])(
    "leaves the literal %s alone",
    (argument) => {
      expect(cmdQuote(argument)).toBe(argument);
    },
  );

  it("quotes what cmd.exe would otherwise read as syntax", () => {
    expect(cmdQuote("a b")).toBe('"a b"');
    expect(cmdQuote(String.raw`C:\Program Files\nodejs\npm.cmd`)).toBe(
      String.raw`"C:\Program Files\nodejs\npm.cmd"`,
    );
    // The empty string is the window title in `start "" <url>`. Unquoted it
    // vanishes, and then cmd reads the URL as the title and opens nothing.
    expect(cmdQuote("")).toBe('""');
  });

  it("quotes a URL carrying query parameters", () => {
    // The bug this whole change grew out of: Digistore24's approval link goes
    // through here, and an unquoted `&` ends the command line at the first one.
    const url = "https://www.digistore24.com/api-key/approve?request_token=abc123&lang=de";
    expect(cmdQuote(url)).toBe(`"${url}"`);
    expect(cmdQuote(url)).toContain("&lang=de");
  });

  it("refuses a double quote instead of mangling it", () => {
    // cmd.exe's rules and the target program's parsing of the same string
    // disagree about `"`. Nothing in this template produces one; a refusal says
    // so out loud rather than producing a command line that is subtly wrong.
    expect(() => cmdQuote('say "hi"')).toThrow(/double quote/);
  });

  it("passes % and ! through, because a percent-encoded URL is normal", () => {
    // cmd expands `%NAME%` only for a variable that exists and `!` only under
    // delayed expansion, which `/d /s /c` does not switch on. Refusing these
    // would refuse the ordinary case.
    expect(cmdQuote("a%20b")).toBe("a%20b");
    expect(cmdQuote("hi!")).toBe("hi!");
  });
});

describe("the command line proc.mjs hands to cmd.exe", () => {
  it("is the join Node used to make, for every call this template makes", () => {
    // Node's own `shell: true` builds `[file, ...args].join(" ")`. For plain
    // tokens the result has to be identical, or this change would have altered
    // what runs on Windows rather than only how it is started.
    expect(cmdLine("npm", ["run", "typecheck"])).toBe("npm run typecheck");
    expect(cmdLine("npm", ["install"])).toBe("npm install");
    expect(cmdLine("npm", ["install", "--save-dev", "embedded-postgres@16.14.0-beta.17"])).toBe(
      "npm install --save-dev embedded-postgres@16.14.0-beta.17",
    );
  });

  it("quotes the resolved shim path, which normally has a space in it", () => {
    expect(cmdLine(String.raw`C:\Program Files\nodejs\npm.cmd`, ["run", "test"])).toBe(
      String.raw`"C:\Program Files\nodejs\npm.cmd" run test`,
    );
  });

  it("keeps a URL in one piece behind start", () => {
    const url = "https://example.com/a?x=1&y=2";
    expect(cmdLine("start", ["", url])).toBe(`start "" "${url}"`);
  });
});

describe("finding a command on the PATH", () => {
  it("finds the Node this test is running on", () => {
    // Whatever `node` is called here, it is on the PATH under its own basename
    // — that is what makes it the honest self-check for this function.
    const found = whichCommand(path.basename(process.execPath));
    expect(found).not.toBeNull();
  });

  it("takes a path that says where it is at its word", () => {
    expect(whichCommand(process.execPath)).toBe(process.execPath);
  });

  it("answers null for something that is not there", () => {
    expect(whichCommand("ds24-a-command-that-does-not-exist")).toBeNull();
    // A path, not a PATH lookup — and still nothing.
    expect(whichCommand(path.join(process.execPath, "not-a-directory", "nope"))).toBeNull();
  });
});
