// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Chat rules — deliberately PURE functions, no database, no API client.
//
// Why they are separate: every one of these decisions is made on an endpoint a
// stranger can call in a loop, and each one costs the operator money the moment
// it is wrong. So they are testable one by one (lib/ai/rules.test.ts), and the
// route handler (app/api/chat/route.ts) becomes transcription.
//
// LANGUAGE: this layer returns NO finished sentences, only codes
// ("chatMessageTooLong"). Translation happens where the answer reaches a
// person — here the client, because the stream carries the code rather than a
// sentence. A sentence written in this file would exist in exactly one
// language, and not necessarily the customer's.
import type { Limit } from "@/lib/rate-limit";

/**
 * Every reason a message is refused. Each code MUST have a text in
 * `messages/*.json` under `errors` — `i18n/messages.test.ts` walks this list
 * exactly as it walks TOKEN_ERROR_CODES.
 */
export const CHAT_ERROR_CODES = [
  // The feature is off on this installation, or its config is broken.
  "chatUnavailable",
  // Signed in, but the plan the chat belongs to is not held.
  "chatNoAccess",
  // Too many messages inside the window.
  "chatRateLimited",
  "chatEmptyMessage",
  "chatMessageTooLong",
  // The knowledge base is empty or unreadable — she would have nothing to
  // answer from, and an assistant with no handbook invents one.
  "chatNoKnowledge",
  // The model call itself failed. Deliberately vague towards the customer; the
  // real reason is in the server log.
  "chatFailed",
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/**
 * An error carrying a translatable reason — the same contract as `TokenError`
 * in lib/tokens/rules.ts.
 */
export class ChatError extends Error {
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode) {
    // The message IS the code — it belongs in logs, not in front of people.
    super(code);
    this.name = "ChatError";
    this.code = code;
  }
}

/**
 * The longest question accepted.
 *
 * Not a UX preference: every character here is billed as input again on every
 * subsequent turn, because the history is re-sent each time. An unbounded field
 * is an unbounded bill somebody else pays.
 */
export const MAX_MESSAGE_CHARS = 2000;

/**
 * Does the text carry a control character that must never reach the database?
 *
 * NUL above all: JavaScript accepts it, Postgres rejects it, and the rejection
 * would land AFTER the model call was already paid for. Tab, line feed and
 * carriage return are legitimate in a typed question and are therefore allowed
 * through — the same list `decideAdjustment` applies to an operator's reason.
 *
 * Written as a loop rather than a regular expression on purpose: a character
 * class of control characters is written with escapes, and an editor that
 * resolves those escapes into the bytes themselves turns this file into
 * something `git diff` calls binary. The loop says the same thing in
 * characters anybody can read.
 */
export function hasControlChar(text: string): boolean {
  const allowed = [9, 10, 13];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 127) return true;
    if (code < 32 && !allowed.includes(code)) return true;
  }
  return false;
}

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export type MessageCheck =
  | { ok: true; text: string }
  | { ok: false; code: ChatErrorCode };

/**
 * Is this something we can send to the model?
 *
 * The refusal lives here and not in the form's `maxlength` attribute: a route
 * handler is an HTTP endpoint of its own and can be called without the page
 * ever having been rendered.
 */
export function checkMessage(input: unknown): MessageCheck {
  if (typeof input !== "string") return { ok: false, code: "chatEmptyMessage" };
  const text = input.trim();

  // Empty is the obvious case. The second half is not: `trim()` does not strip
  // a zero-width space (U+200B) or a braille blank (U+2800), so a "question"
  // made of those arrives, costs a full API call and produces a confused
  // answer. Demanding one letter or digit is the same test `decideAdjustment`
  // applies to an operator's reason, for the same reason.
  if (text === "" || !/[\p{L}\p{N}]/u.test(text)) {
    return { ok: false, code: "chatEmptyMessage" };
  }
  if (text.length > MAX_MESSAGE_CHARS) {
    return { ok: false, code: "chatMessageTooLong" };
  }
  if (hasControlChar(text)) {
    return { ok: false, code: "chatEmptyMessage" };
  }

  return { ok: true, text };
}

/**
 * The turns actually sent along, newest kept.
 *
 * Two jobs, and the second is the one that is easy to miss:
 *
 *  1. Bound the cost. History is re-sent in full on every turn, so an
 *     unbounded conversation grows quadratically in tokens.
 *  2. **Leave a valid conversation.** The Messages API requires the first
 *     message to be `user`. Cutting a window out of the middle routinely lands
 *     on an assistant turn, and the request is then rejected — after the
 *     customer has already typed. So a leading assistant turn is dropped.
 *  3. **Leave an ALTERNATING conversation.** Two user turns in a row are not
 *     hypothetical: `app/api/chat/route.ts` stores the question before the
 *     call and the answer only if there was one, so any failed or empty answer
 *     leaves an orphaned question behind for ever, and the next message adds
 *     another. Anthropic merges consecutive same-role turns, which is why this
 *     went unnoticed; Gemini's `contents` is stricter, and this layer promises
 *     one call shape across five providers.
 *
 * @param maxTurns exchanges, not messages: one turn is a question plus its answer.
 */
export function trimHistory(
  history: readonly ChatTurn[],
  maxTurns: number,
): ChatTurn[] {
  const limit = Number.isInteger(maxTurns) && maxTurns > 0 ? maxTurns : 1;
  const kept = history.slice(-limit * 2);
  while (kept.length > 0 && kept[0].role !== "user") kept.shift();

  // The NEWEST of a run is the one kept: the last user turn is the question
  // being asked right now, and an older unanswered one is what the failure left
  // behind. Keeping the first would answer the abandoned question and drop the
  // live one.
  return kept.filter(
    (turn, index) => index === kept.length - 1 || turn.role !== kept[index + 1].role,
  );
}

/**
 * May this member use the assistant — the answer the LAUNCHER hangs on.
 *
 * Two questions, and they are different: whether the feature exists on this
 * installation (`isChatEnabled()`, a config answer) and whether this person
 * holds what it belongs to (`hasPlan()`, a database answer). Pure here so both
 * callers give the same answer to the same inputs.
 *
 * ⚠️ **It decides what is SHOWN, never what is allowed.** The permission itself
 * is re-asked on every request in `app/api/chat/route.ts`, and it has to be: a
 * button that is not rendered is not a check, and that endpoint is reachable by
 * anybody with a session and a terminal.
 */
export function mayUseChat(
  enabled: boolean,
  requiresPlan: string | null,
  holdsPlan: boolean,
): boolean {
  if (!enabled) return false;
  return requiresPlan === null || holdsPlan;
}

/**
 * Does the assistant keep her entry in the navigation — the answer the SIDEBAR
 * hangs on, and it is not the same one the launcher gets.
 *
 * Hiding the link of a feature that is switched off is right, and it stays
 * right: nobody wants a menu entry leading to a page that only ever says "not
 * configured". But there are two ways to be off, and they are not the same
 * thing at all:
 *
 *   the PRODUCT said no   — `"enabled": false` in `config/ai-chat.json`. There
 *                           is nothing to tell anybody. No entry.
 *   the MACHINE cannot    — she is switched on, and the key of the provider her
 *                           task is bound to is missing, or the config does not
 *                           hold together. The Operator asked for her and did
 *                           not get her.
 *
 * In the second case the app knows exactly what is wrong — `chatOffReason()`
 * has the answer and `/dashboard/chat` renders it in a sentence — and used to
 * show it to nobody, because the same flag that hid the misconfigured feature
 * hid the only route to its diagnosis. Switched on, key present for the wrong
 * company, and the entire app silent: no button, no menu entry, no notice. The
 * one way to find out was to type the URL of a page you had no reason to
 * believe existed.
 *
 * So: **a feature the Operator switched ON keeps its entrance even when this
 * machine cannot run it — for the Operator.** Members get the old behaviour and
 * must, because the diagnosis names an environment variable and a customer is
 * owed neither the problem nor the infrastructure behind it.
 *
 * ⚠️ Cosmetics, like every `featureKey`. `/dashboard/chat` renders its own
 * notice for whoever types the URL, and `app/api/chat/route.ts` refuses on its
 * own — a menu entry is not a permission and its absence is not a check.
 */
export function chatNavVisible(
  usable: boolean,
  wanted: boolean,
  isOwner: boolean,
): boolean {
  if (usable) return true;
  return wanted && isOwner;
}

/** Bucket name for `lib/rate-limit.ts`. One per feature, as everywhere else. */
export const CHAT_RATE_BUCKET = "chat-message";

/**
 * How often one member may ask.
 *
 * Ten minutes rather than an hour: this is a cost brake, not a security
 * control, and it has to forgive somebody who genuinely has ten questions in a
 * row. Note the in-memory, per-process caveat in `lib/rate-limit.ts` — behind
 * several instances every limit is multiplied by their number.
 */
export function chatLimit(maxMessages: number): Limit {
  return { max: maxMessages, windowMs: 10 * 60 * 1000 };
}
