// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

// **The notice that says a machine is on the other end.**
//
// Article 50(1) EU AI Act, applicable since 2 August 2026: a system that talks
// to people has to say it is a machine, "at the latest at the time of the first
// interaction", clearly and distinguishably. This is not a disclaimer about
// accuracy and it is not a UX nicety — it is the notice itself.
//
// ── Why a component and not a paragraph in each surface ────────────────────
// There are two surfaces today and the realistic failure is the third: somebody
// building a companion of their own, writing their own notice, and putting it
// under the send button where nobody reads it before they type. **One line to
// mount is a rule an agent follows; a paragraph to remember is not** — and
// `lib/ai/disclosure.mjs` can then find the mount by reading the file, which is
// what makes `node run.mjs legal-check` able to report a missing one.
//
// ── Three properties, and all three are asserted ───────────────────────────
//   1. It is rendered **once** per surface.
//   2. It is **above** the transcript, never under the input box. Below the fold
//      of a short panel is not "at the first interaction".
//   3. It is **unconditional** — not behind "once there are messages". The first
//      interaction is the one that has not happened yet.
//
// Do not reword the sentences into something friendlier.
// `lib/ai/disclosure.test.ts` fails the build if either language stops naming
// the thing as a machine, and `docs/compliance.md` says why. An assistant with a
// human name and a face is exactly the case the law has in mind.
import { useTranslations } from "next-intl";

export interface AiDisclosureProps {
  /**
   * Which surface this is. It is also the message namespace, so the text is
   * `<surface>.disclaimer` — and `DISCLOSURE_SURFACES` in
   * `lib/ai/disclosure.mjs` is the list both the build guard and `legal-check`
   * walk. **Adding a third surface means adding an entry there**, or nothing
   * will ever notice its notice going missing.
   */
  surface: "chat" | "companion";
  /**
   * Only the assistant's sentence takes one — she has a name. The companion's
   * is deliberately written without a placeholder, so an app whose companion has
   * no name needs no value. A vendor who names theirs adds `{name}` to **both**
   * message files; `i18n/messages.test.ts` checks placeholder parity.
   */
  name?: string;
}

export function AiDisclosure({ surface, name }: AiDisclosureProps) {
  const t = useTranslations(surface);

  return (
    <p className="text-muted-foreground border-b pb-3 text-xs">
      {name === undefined ? t("disclaimer") : t("disclaimer", { name })}
    </p>
  );
}
