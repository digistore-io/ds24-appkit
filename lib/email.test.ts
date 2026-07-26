// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { credentialBodies, type CredentialTexts } from "./email";

const TEXTS: CredentialTexts = {
  locale: "de",
  subject: "Sicherheitshinweis",
  heading: "Etwas hat sich an deiner Anmeldung geändert",
  what: "Das Kennwort deines Kontos wurde geändert.",
  when: "Zeitpunkt: 24. Juli 2026, 17:42 (UTC)",
  notYou: "Warst du das nicht? Melde dich beim Betreiber.",
};

describe("the credential-change notice", () => {
  // THE test of this file. The notice goes to somebody whose account may
  // already be in the wrong hands, and it is the one mail this app sends that
  // must be useless to forge. A link — any link — turns it into a phishing
  // template carrying our sender address, and "wasn't me, undo it" is exactly
  // the button an attacker would want us to have trained people to click.
  it("contains no link, in either body", () => {
    const { html, text } = credentialBodies(TEXTS);
    for (const [name, body] of [
      ["html", html],
      ["text", text],
    ] as const) {
      expect(body, `${name}: has an anchor`).not.toMatch(/<a[\s>]/i);
      expect(body, `${name}: has an href`).not.toMatch(/href\s*=/i);
      expect(body, `${name}: has a URL`).not.toMatch(/https?:\/\//i);
      expect(body, `${name}: has a mailto`).not.toMatch(/mailto:/i);
    }
  });

  it("says what changed, when, and what to do about it", () => {
    const { html, text } = credentialBodies(TEXTS);
    for (const body of [html, text]) {
      expect(body).toContain(TEXTS.what);
      expect(body).toContain(TEXTS.when);
      expect(body).toContain(TEXTS.notYou);
    }
  });

  it("escapes the texts rather than pasting them into the markup", () => {
    // The texts come from messages/*.json, so this is not an injection route
    // today. It is one the moment somebody interpolates a value into them —
    // an app name, an address — and the escaping has to already be there.
    const { html } = credentialBodies({
      ...TEXTS,
      what: `<script>alert("x")</script> & "quoted"`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("declares the language on the html element", () => {
    // Screen readers and mail clients pick the pronunciation from it, and the
    // notice is bilingual by design.
    expect(credentialBodies({ ...TEXTS, locale: "en" }).html).toContain(
      '<html lang="en">',
    );
  });
});
