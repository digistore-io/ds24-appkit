// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The assistant's request pipeline — everything AFTER "who is asking".
//
// Two doors lead here, and they answer the who-question differently:
// `app/api/chat/route.ts` proves a session cookie (`currentActiveUser()`),
// `app/api/v1/chat/messages/route.ts` proves a bearer key (`guardApi()`).
// Everything from "is the feature on" to the NDJSON stream is identical, so
// it lives ONCE — a second copy of this pipeline would be a second place for
// the knowledge check, the plan gate and the rate limit to silently disagree.
//
// The `memberId` handed in is already authenticated by the caller. Both doors
// share `CHAT_RATE_BUCKET` keyed by that member, so web and API draw on ONE
// ceiling by construction — a customer cannot double their allowance by
// asking through their phone.
//
// ── Why the answer is a stream of JSON lines ───────────────────────────────
// A support answer takes seconds to write. Without streaming the page shows a
// spinner for all of them and people press the button again. Each line is one
// JSON object:
//
//   {"type":"delta","text":"…"}   a piece of the answer
//   {"type":"done"}               the answer is complete and stored
//   {"type":"error","code":"…"}   a code from lib/ai/rules.ts, for the client to translate
//
// Errors travel IN the stream rather than as a status code once the response
// has begun: by then the headers are long gone, and a stream that simply stops
// is indistinguishable from a network drop.
import { LOCALE_LABELS, type Locale } from "@/i18n/config";
import { hasPlan } from "@/lib/entitlements/manage";
import { isLimited, record } from "@/lib/rate-limit";
import { APP_NAME } from "@/lib/app";
import { chatConfig, isChatEnabled } from "@/lib/ai/chat-config";
import { appendTurn, listConversation } from "@/lib/ai/conversation";
import { loadKnowledge } from "@/lib/ai/knowledge";
import { buildSystemBlocks } from "@/lib/ai/prompt";
import { navMenus } from "@/lib/ai/nav-labels";
import { streamTask } from "@/lib/ai/run";
import { retriever } from "@/lib/ai/retriever";
import {
  CHAT_RATE_BUCKET,
  chatLimit,
  checkMessage,
  trimHistory,
  type ChatErrorCode,
} from "@/lib/ai/rules";

/** A refusal made before a single token was generated. */
function refuse(code: ChatErrorCode, status: number): Response {
  return Response.json({ type: "error", code }, { status });
}

/**
 * Runs one chat request for an ALREADY AUTHENTICATED member.
 *
 * The order below is not cosmetic — each check is cheaper than the one after
 * it, and the expensive one (an API call somebody else pays for) is last:
 *
 *   feature on?  →  handbook readable?  →  plan held?
 *                →  under the rate limit?  →  is the message sane?  →  ask
 */
export async function runChatRequest(args: {
  memberId: string;
  request: Request;
  /** The reader's language, for the answer. The web door reads the cookie. */
  locale: Locale;
}): Promise<Response> {
  const { memberId, request, locale } = args;

  // 1. Is the feature on at all? Cheap, and it is the answer for an app that
  //    ships with the chat switched off.
  if (!isChatEnabled()) return refuse("chatUnavailable", 503);

  const config = chatConfig();

  // 2. Is there anything to answer from? An assistant with no handbook does not
  //    fail, which is the problem — she invents one.
  const knowledge = loadKnowledge();
  if (knowledge.docs.length === 0) {
    console.error("[chat] the knowledge base is empty or unreadable:", knowledge.problems);
    return refuse("chatNoKnowledge", 503);
  }
  // Reported whenever there are any, not only when EVERY document failed. Nine
  // of ten failing validation used to look exactly like a healthy handbook: she
  // answers confidently from the one that parsed and says "I do not know" to
  // everything the other nine cover, and nothing anywhere says why.
  if (knowledge.problems.length > 0) {
    console.warn(
      `[chat] ${knowledge.problems.length} document(s) are not usable and are not being sent:`,
      knowledge.problems,
    );
  }

  // 3. May THIS person use it? `hasPlan` reads `grants` — never a billing
  //    table. `requiresPlan: null` means every signed-in member may.
  if (config.requiresPlan && !(await hasPlan(memberId, config.requiresPlan))) {
    return refuse("chatNoAccess", 403);
  }

  // 4. The cost brake. Metered per member, not per address: the member id is
  //    what the caller's authentication proves, and it does not change when
  //    they edit their profile. ONE bucket for both doors — see the header.
  const limit = chatLimit(config.maxMessagesPer10Min);
  if (isLimited(CHAT_RATE_BUCKET, memberId, limit)) {
    return refuse("chatRateLimited", 429);
  }

  // 5. Is the message something we can send? The body is whatever the caller
  //    posted — the form's `maxlength` is not a check.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("chatEmptyMessage", 400);
  }
  const checked = checkMessage((body as { message?: unknown } | null)?.message);
  if (!checked.ok) return refuse(checked.code, 400);

  record(CHAT_RATE_BUCKET, memberId, limit);

  // The question is stored BEFORE the model is asked. If the call then fails,
  // the transcript keeps the question rather than losing what somebody typed —
  // an unanswered question on reload is honest, a vanished one is a bug report.
  await appendTurn({ memberId, role: "user", content: checked.text });

  const stored = await listConversation(memberId);
  const history = trimHistory(
    stored.map((turn) => ({ role: turn.role, content: turn.content })),
    config.maxHistoryTurns,
  );

  const system = buildSystemBlocks({
    // The menu she is allowed to point at, in every language the app speaks —
    // read from `messages/*.json`, not from the handbook, which is written
    // once and in one language. Static, so it stays in the cached half.
    persona: { assistantName: config.name, appName: APP_NAME, menus: navMenus() },
    // The handbook read at step 2, not a second read of it.
    knowledge: await retriever(knowledge).blocks(checked.text),
    context: {
      languageLabel: LOCALE_LABELS[locale],
      // The day only, never the time: an ISO timestamp would be a new value on
      // every request. It sits after the cache breakpoint either way, but a
      // date that changes once a day is also one a human can read in a log.
      today: new Date().toISOString().slice(0, 10),
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        // ONE call, and it names a TASK rather than a model. Which company
        // answers, which model, how many tokens and with what tuning is
        // `config/ai-models.json` → tasks.chat — so an Operator moves her to a
        // different vendor without touching this file. What she IS stays here
        // and in `config/ai-chat.json`: her name, her handbook, her history.
        //
        // The cost line and the usage row are written by the layer (see
        // lib/ai/usage.ts), including on the failure path below. There is
        // nothing to log here any more.
        let answer = "";

        for await (const event of streamTask("chat", {
          system,
          messages: history,
          memberId,
        })) {
          if (event.type === "delta") {
            answer += event.text;
            send({ type: "delta", text: event.text });
          }
        }

        if (answer.trim() !== "") {
          await appendTurn({ memberId, role: "assistant", content: answer });
        }

        send({ type: "done" });
      } catch (error) {
        // Deliberately vague towards the customer, precise in the log: the
        // reason is routinely an invalid key or a rate limit at the API, and
        // neither is theirs to read. The typed provider outcome is already in
        // the usage row and in the layer's own log line — what reaches the
        // Member stays the one sentence she has always seen.
        console.error("[chat] the model call failed:", error);
        send({ type: "error", code: "chatFailed" satisfies ChatErrorCode });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // The answer is streamed; a proxy that buffers it turns this back into a
      // spinner. nginx honours this one.
      "x-accel-buffering": "no",
    },
  });
}
