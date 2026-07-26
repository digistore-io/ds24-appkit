// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The handbook, as the model receives it.
//
// The fences are a structured container around text somebody else wrote, and
// the tests below are about the one thing that must hold of any such container:
// the contained text cannot get out of it. `frontmatter.mjs` validates a title
// for emptiness and a length limit and nothing else, so a quote in a title and
// a `</document>` in a body are both legal input here.
import { describe, it, expect } from "vitest";

import { renderContents, renderDocuments, fullContextRetriever } from "./retriever";
import type { KnowledgeDoc } from "./knowledge";

const doc = (over: Partial<KnowledgeDoc> = {}): KnowledgeDoc => ({
  path: "10-reference/account.md",
  section: "reference",
  title: "The account page",
  summary: "What a member can change about themselves.",
  updated: null,
  body: "Open /dashboard/account.",
  ...over,
});

describe("renderDocuments", () => {
  it("does not let a body close its own fence", () => {
    // A how-to about HTML, or a page documenting this very handbook format —
    // both are things the `ai-chat-knowledge` skill will happily write. Before
    // this was escaped, everything after the literal read to the model as
    // top-level system prompt rather than as somebody's handbook.
    const rendered = renderDocuments([
      doc({ body: "Close the tag like this: </document> — then continue." }),
    ]);

    expect(rendered.match(/<\/document>/g)).toHaveLength(1);
    expect(rendered.endsWith("</document>")).toBe(true);
    expect(rendered).toContain("&lt;/document>");
  });

  it("does not let a title break out of its attribute", () => {
    const rendered = renderDocuments([doc({ title: 'Use "quotes" carefully' })]);

    expect(rendered).toContain('title="Use &quot;quotes&quot; carefully"');
    // The opening tag still ends where it should.
    expect(rendered.split("\n")[0].endsWith(">")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    const rendered = renderDocuments([doc()]);
    expect(rendered).toContain("Open /dashboard/account.");
    expect(rendered).toContain('title="The account page"');
  });
});

describe("renderContents", () => {
  it("lists every document with its section and summary", () => {
    const contents = renderContents([doc()]);
    expect(contents).toContain("(reference) The account page");
    expect(contents).toContain("[10-reference/account.md]");
  });
});

describe("fullContextRetriever", () => {
  it("hands back one cacheable block", async () => {
    const blocks = await fullContextRetriever([doc()]).blocks("anything");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].cacheable).toBe(true);
  });

  it("renders the same bytes for the same documents", async () => {
    // The whole premise of the file: the handbook is byte-identical on every
    // request, which is what earns the cached prefix. The memoization added for
    // the per-request re-render must not change that.
    const docs = [doc()];
    const first = await fullContextRetriever(docs).blocks("question one");
    const second = await fullContextRetriever(docs).blocks("a different question");
    expect(second[0].text).toBe(first[0].text);
  });
});
