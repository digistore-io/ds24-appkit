// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The guard on the AI disclosure — Article 50(1) EU AI Act.
//
// Since 2 August 2026 a system that talks to people has to say that it is a
// machine, "at the latest at the time of the first interaction", clearly and
// distinguishably. The assistant in this template is exactly the case the rule
// was written for: she has a human name, a face and a friendly tone, and
// nothing about her is obviously a machine to the person typing.
//
// One line in `messages/*.json` carries that obligation — `chat.disclaimer`,
// rendered at the top of `ChatWindow`. It reads like a UX nicety, which is the
// whole problem: the realistic way it disappears is not deletion but a
// rewrite, somebody making it warmer ("Lisa hilft dir gerne!") in a commit
// about tone. Nothing else in the app would break, and the app would be
// non-compliant.
//
// Same shape as `lib/ai/providers/leak-guard.test.ts` and
// `db/sql-cast.test.ts`: a rule nobody can be expected to remember, enforced by
// something that reads the tree. The reasoning for a human is in
// `docs/compliance.md`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const CHAT_WINDOW = join("app", "dashboard", "chat", "ui.tsx");
const source = readFileSync(join(ROOT, CHAT_WINDOW), "utf8");

/**
 * How each language names a machine.
 *
 * Word boundaries on purpose: "KI" must not be satisfied by "KIosk", and the
 * German text may not pass by containing the English "AI" — a German user reads
 * the German string, and that one has to say it.
 */
const NAMES_A_MACHINE: Record<string, RegExp> = {
  de: /\bKI\b|\bkünstliche[rn]? Intelligenz\b/i,
  en: /\bAI\b|\bartificial intelligence\b/i,
};

describe("the AI disclosure exists in every language", () => {
  const MESSAGES: Record<string, { chat: { disclaimer?: string } }> = { de, en };

  for (const [locale, messages] of Object.entries(MESSAGES)) {
    it(`${locale}: names the assistant as an AI`, () => {
      const text = messages.chat.disclaimer;

      expect(
        text,
        `messages/${locale}.json has no chat.disclaimer. It is the notice ` +
          `required by Art. 50(1) EU AI Act, not decoration — see docs/compliance.md.`,
      ).toBeTruthy();

      expect(
        text,
        `messages/${locale}.json → chat.disclaimer no longer says that the ` +
          `assistant is an AI. Whatever else it says, it has to say that.`,
      ).toMatch(NAMES_A_MACHINE[locale]);
    });
  }
});

describe("the chat window renders it", () => {
  it("references the key", () => {
    expect(
      source,
      `${CHAT_WINDOW} no longer renders chat.disclaimer.`,
    ).toContain('t("disclaimer"');
  });

  it("renders it once, in the part BOTH variants use", () => {
    // `ChatWindow` is drawn twice — as a page and as the floating panel
    // (`launcher.tsx`). The shared `conversation` block is what both mount, so
    // a disclosure placed there is a disclosure the panel gets too. One that
    // drifted into the `panel ? … : …` branch below would silently cover only
    // one of the two places customers meet her.
    const occurrences = source.split('t("disclaimer"').length - 1;
    expect(occurrences, "expected exactly one disclosure").toBe(1);

    const conversationStart = source.indexOf("const conversation = (");
    const returnStart = source.indexOf("  return (", conversationStart);
    const disclosureAt = source.indexOf('t("disclaimer"');

    expect(conversationStart).toBeGreaterThan(-1);
    expect(returnStart).toBeGreaterThan(conversationStart);
    expect(
      disclosureAt > conversationStart && disclosureAt < returnStart,
      `the disclosure moved out of the shared \`conversation\` block. The ` +
        `floating panel renders that block and nothing else — putting the ` +
        `notice anywhere variant-specific leaves one of the two uncovered.`,
    ).toBe(true);
  });

  it("comes before the transcript, not after the input box", () => {
    // "At the latest at the time of the first interaction" — a line under the
    // send button, below the fold of a 20rem panel, is not that.
    const disclosureAt = source.indexOf('t("disclaimer"');
    const transcriptAt = source.indexOf("overflow-y-auto");

    expect(
      disclosureAt < transcriptAt,
      `the disclosure is rendered after the transcript. It has to be readable ` +
        `before the first question, in the short panel as well as on the page.`,
    ).toBe(true);
  });
});

describe("the guard itself", () => {
  it("actually read the component", () => {
    // Non-vacuity: a wrong path would make every assertion above pass by
    // testing an empty string.
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain("ChatWindow");
  });

  it("would catch a friendlier rewrite", () => {
    expect(NAMES_A_MACHINE.de.test("Lisa ist eine KI. Sie kann sich irren.")).toBe(true);
    expect(NAMES_A_MACHINE.de.test("Lisa hilft dir gerne weiter!")).toBe(false);
    expect(NAMES_A_MACHINE.en.test("Lisa is an AI. She can be wrong.")).toBe(true);
    expect(NAMES_A_MACHINE.en.test("Lisa is happy to help!")).toBe(false);
    // The German string must not pass on the English word.
    expect(NAMES_A_MACHINE.de.test("Lisa is an AI assistant.")).toBe(false);
  });
});
