// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Storing what was said.
//
// One conversation per member — deliberately, and it is the decision most worth
// knowing about this file. Threads would need a list, a switcher, a "new
// conversation" button and a rule for which one a question lands in, and a
// support assistant does not earn that: people ask a question, get an answer,
// and come back next week with an unrelated one. The window sent to the model
// (lib/ai/rules.ts → trimHistory) means an old topic falls out of context by
// itself rather than confusing the next question.
//
// If threads are ever wanted, this is where they start: a `conversationId` on
// the table and a parameter here. Nothing above this file reads the rows
// directly.
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import type { ChatRole, ChatTurn } from "./rules";

/**
 * How many messages the page loads.
 *
 * Bigger than the window sent to the model on purpose: the person can scroll
 * back through more than the model is told about, which is the honest shape —
 * the transcript is theirs, the context window is a cost decision.
 */
export const CONVERSATION_PAGE_SIZE = 100;

export interface StoredTurn extends ChatTurn {
  id: string;
  createdAt: Date;
}

/** This member's conversation, oldest first — the order it is read in. */
export async function listConversation(
  memberId: string,
  take: number = CONVERSATION_PAGE_SIZE,
): Promise<StoredTurn[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.memberId, memberId))
    // Newest first in the query so the LIMIT keeps the RECENT ones, then
    // reversed for display. Ordering ascending and limiting would hand back the
    // oldest hundred messages and drop everything the person just said.
    .orderBy(desc(chatMessages.createdAt))
    .limit(take);

  return rows.reverse();
}

/** Appends one message. Returns its id, so the client can key on it. */
export async function appendTurn(args: {
  memberId: string;
  role: ChatRole;
  content: string;
}): Promise<string> {
  const [row] = await db
    .insert(chatMessages)
    .values({
      memberId: args.memberId,
      role: args.role,
      content: args.content,
    })
    .returning({ id: chatMessages.id });

  return row.id;
}

/**
 * Deletes this member's conversation.
 *
 * Scoped to the member id the caller resolved from the session — never one out
 * of a form. The same rule `spendTokens` follows, for the same reason: a route
 * handler is an HTTP endpoint of its own, and an id taken from a request body
 * would let anybody wipe anybody's transcript.
 */
export async function clearConversation(memberId: string): Promise<number> {
  const deleted = await db
    .delete(chatMessages)
    .where(and(eq(chatMessages.memberId, memberId)))
    .returning({ id: chatMessages.id });

  return deleted.length;
}
