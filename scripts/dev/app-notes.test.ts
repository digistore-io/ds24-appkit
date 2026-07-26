// The greeting's hint about docs/app.md has to be right on the two occasions it
// is read: a fresh clone (no notes, no pages — say nothing) and a project under
// way (pages built, notes behind — name exactly the ones missing).
//
// A hint that fires when nothing is missing is worse than none: it appears on
// every session start, and whoever learns to ignore it also ignores it on the
// day it is correct.
import { describe, expect, it } from "vitest";
import { readNotes, unwrittenPages } from "./app-notes.mjs";

describe("readNotes", () => {
  it("returns the text when the file is there", () => {
    expect(readNotes(() => "# This app")).toBe("# This app");
  });

  it("returns null instead of throwing when it is not", () => {
    expect(
      readNotes(() => {
        throw new Error("ENOENT");
      }),
    ).toBeNull();
  });
});

describe("unwrittenPages", () => {
  it("says nothing about a template nobody has built on yet", () => {
    // The most common case by far — and the one where a hint would be noise.
    expect(unwrittenPages([], null)).toEqual([]);
  });

  it("counts every page as unwritten while there are no notes", () => {
    expect(unwrittenPages(["reports", "invoices"], null)).toEqual(["reports", "invoices"]);
  });

  it("names only the pages the notes leave out", () => {
    const notes = "## Features\n\n### Reports — `/dashboard/reports`\n";
    expect(unwrittenPages(["reports", "invoices"], notes)).toEqual(["invoices"]);
  });

  it("is quiet when the notes cover everything", () => {
    const notes = "### Reports `/dashboard/reports`\n### Invoices `/dashboard/invoices`\n";
    expect(unwrittenPages(["reports", "invoices"], notes)).toEqual([]);
  });

  it("does not let `reports` cover a page called `report`", () => {
    // The near-miss: substring matching would call this covered, and the entry
    // that is actually missing is the one nobody notices.
    expect(unwrittenPages(["report"], "### Reports — `/dashboard/reports`")).toEqual(["report"]);
  });

  it("treats a folder with regex characters as a name, not a pattern", () => {
    expect(unwrittenPages(["[id]"], "nothing here")).toEqual(["[id]"]);
    expect(unwrittenPages(["[id]"], "the detail page `[id]` shows one record")).toEqual([]);
  });
});
