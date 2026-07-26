// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// What the menu on the left is actually called — for the assistant.
//
// ── Why the model has to be told ───────────────────────────────────────────
// The handbook in `content/knowledge/` is written by the operator, in one
// language, and it is where somebody naturally writes "open *Account* from the
// menu". The app's menu is `messages/de.json` / `messages/en.json`, it is
// bilingual, and it gets renamed. So a label written into the handbook is a
// copy that goes stale in one language on the day it is written and in both on
// the first rename — and Lia has no way of noticing: she repeats what she was
// given, in a language the handbook may not even be in.
//
// The shipped handbook said *Account*, the sidebar says "Mein Konto" and "My
// account", and she sent German customers to a menu entry that does not exist.
//
// So the labels travel with the prompt, from the message files, in every
// language the app speaks — one source of truth, and a rename fixes her too.
// `nav-labels.test.ts` pins the list against `NAVIGATION` in
// `components/app-shell.tsx`, so a sidebar entry added, renamed or reordered
// fails the build rather than quietly teaching her yesterday's menu.
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import de from "@/messages/de.json";
import en from "@/messages/en.json";

/**
 * The entries a MEMBER sees, in sidebar order.
 *
 * Owner-only entries are deliberately absent. She answers customers, and
 * sending one to "Admin" is a dead end for them and a support ticket for the
 * operator. `/dashboard/chat` stays in: an operator who switched her off has
 * no assistant to be asked about it.
 */
export const MEMBER_NAV_KEYS = [
  "overview",
  "account",
  "billing",
  "chat",
  "plans",
] as const;

export type MemberNavKey = (typeof MEMBER_NAV_KEYS)[number];

/** The message files, by locale. A new language is added here as well. */
const MESSAGES: Record<Locale, { nav: Record<MemberNavKey, string> }> = { de, en };

export interface NavMenu {
  locale: Locale;
  /** How the model should name this language — "Deutsch", "English". */
  languageLabel: string;
  /** The menu entries, in the order they appear on screen. */
  labels: readonly string[];
}

/**
 * The menu, per language.
 *
 * ⚠️ This lands in the CACHED half of the system prompt, so it must be
 * byte-identical on every request from every user of this installation — it is
 * read from static imports and an explicit key order for exactly that reason.
 * See the header of `lib/ai/prompt.ts` for what a varying byte costs.
 */
export function navMenus(): NavMenu[] {
  return LOCALES.map((locale) => ({
    locale,
    languageLabel: LOCALE_LABELS[locale],
    labels: MEMBER_NAV_KEYS.map((key) => MESSAGES[locale].nav[key]),
  }));
}
