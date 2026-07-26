// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The in-app assistant's transcripts.
//
// One row per message, the member's own questions and her answers alike. The
// conversation on screen is the last N rows for that member; the history sent
// to the model is a window over them (lib/ai/rules.ts → trimHistory).
//
// ── Why `cascade`, where money uses `set null` ─────────────────────────────
// `orders`, `subscriptions` and `token_accounts` deliberately keep their rows
// when a customer is deleted: they are financial records, and the fact that
// money moved outlives the account it moved for. A chat transcript is the
// opposite kind of thing. It is the member's own words, it is personal data
// with no retention obligation behind it, and keeping it after they asked to be
// deleted would be the violation rather than the record. So it goes with them.
//
// It is in `docs/data-protection.md` for the same reason, and it is part of
// `node run.mjs data-export` — a subject access request covers what somebody
// typed into a chat window as much as anything else.
import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

/** Who said it. Mirrors the two roles the Messages API accepts. */
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // The member this conversation belongs to. NOT NULL: unlike a purchase,
    // a message with nobody attached is not a record of anything — it is a row
    // no page can ever show and no export can ever find.
    memberId: text("member_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    // What was said. Bounded before it gets here: MAX_MESSAGE_CHARS in
    // lib/ai/rules.ts for a question, `max_tokens` on the API call for an
    // answer. `text` rather than `varchar(n)` because the model's answer length
    // is bounded in tokens, and tokens are not characters.
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Every read is "this member's messages, newest last" — one index for the
    // filter and the order together.
    index("chat_messages_member").on(t.memberId, t.createdAt),
  ],
);
