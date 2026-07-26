---
name: ai-chat-knowledge
description: Builds the knowledge base for the app's in-app AI assistant — interviews the user about the questions their customers actually ask, then writes the handbook under content/knowledge/ in the required format (onboarding, reference, howto, glossary). Use this when the user wants the AI chat, mentions an assistant/support bot, or when the chat is switched on but answers "I do not know". Also the place to switch the chat on and give her a name.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The assistant's handbook — write it, then test it

The app can carry an in-app assistant. She answers **only** from a handbook you
write into `content/knowledge/`; there is nothing else behind her. So this skill
is not about switching a feature on — that is one line — it is about producing
the handbook, because an assistant with a thin one is worse than none at all:
she answers confidently and wrongly, and the customer believes her.

**You write the files. Not the user.** They know the product; you know the
format. Interview, then write.

Full reference — format, caching, cost, privacy: **`docs/ai-chat.md`**.

## Step 1 — Is the chat wanted here at all?

Ask once, plainly. It costs money per answer and it is the first feature in this
template that sends customer input to a third party (see `guardrails` and
`docs/data-protection.md` §8).

> "Shall your app get an assistant that answers your customers' questions out of
> a handbook we write together? She costs a cent or two per answer and she can
> be switched off again at any time."

If yes, settle two things in the same breath:

- **Her name.** Short, easy to type, a proper noun — it is not translated. The
  default is `Lia`. Let them pick.
- **Who may use her.** Every signed-in member (`"requiresPlan": null`), or only
  a plan. If a plan, it is a `kind: "subscription"` or `"one_time"` key from
  `config/digistore-products.json`; access is then answered by
  `hasPlan(memberId, "basis_monatlich")` from `lib/entitlements/manage.ts` — the
  entitlement API, never a billing table. A token package cannot gate her; a
  balance is not an entitlement.

Then set it in `config/ai-chat.json` and tell them what still has to happen:

```json
{ "enabled": true, "name": "Lia", "requiresPlan": null }
```

> "One thing I cannot do for you: the key. Until it is in your `.env`, the page
> shows a notice instead of a chat."

**Any one of the five keys does.** She ships on `"auto"`, so
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY` or
`OPENROUTER_API_KEY` — whichever they already have an account for — is enough,
and she runs on that company's current default model. There is no company to
choose first.

**If they want to choose one deliberately, hand over to the `ai-providers` skill
and come back.** That is the conversation about which invoice they want — accounts
they already have, where the data may go, what it costs — and it does not belong
in the middle of writing a handbook. `node run.mjs ai-check` names the key this
installation actually needs.

## Step 2 — Interview: what do people actually ask?

Use `AskUserQuestion`, one theme at a time, and summarize back after each. Do
not invent the answers — a handbook you made up is exactly the failure this
skill exists to prevent.

1. **Who is asking?** Paying customers, trial users, people who bought once?
   What do they already know when they arrive?
2. **The real questions.** "What do people write to you about? The last ten
   support mails are the best possible source — the boring, repetitive ones
   especially." Push for concrete questions, not topics.
3. **Where people get stuck.** The step in the first hour that goes wrong. This
   is the onboarding section, and it is the one nobody thinks to write.
4. **The words.** Terms this product uses in its own way, and terms customers
   use for the same thing. Both go in the glossary.
5. **The edges.** What must she NOT answer? Refunds, legal questions, anything
   promising a price. Note it — it goes in the handbook as a "send them to
   support" line.

If the user has documentation, a FAQ page or a help centre already, read it
first and interview around the gaps instead of asking them to repeat it.

## Step 3 — Write the files

One topic per file, four sections, frontmatter on every one:

```
content/knowledge/
  00-onboarding/…      the first way through the app
  10-reference/…       feature by feature: what it is, what it does
  20-howto/…           task by task: the steps for one thing
  90-glossary.md       term by term
```

```markdown
---
section: howto
title: Cancel a subscription
summary: Where the cancel link is and what happens to your access.
updated: 2026-07-24
---

## The steps

1. …
```

What separates a handbook she answers well from one she does not:

- **The `summary` is load-bearing.** It is what she reads to decide *which*
  document answers a question. "Information about billing" finds nothing;
  "where the cancel link is and what happens to your access" finds itself.
- **Write the answer, not the feature.** The three steps that cancel a
  subscription beat a description of the billing page.
- **Do not spell out the menu labels.** Write "open your account page from the
  menu on the left", never "click *Account*". She is handed this app's menu
  separately, in every language it speaks, read from `messages/*.json` — so she
  names the entry the reader is actually looking at. A label typed into a
  handbook is a copy in one language that goes stale on the first rename, and
  the handbook shipped with this template proved it: it said *Account* while the
  sidebar said "Mein Konto" and "My account", and she sent German customers
  hunting for an entry that was not there.
- **Say what does NOT happen.** "Cancelling does not delete your account" is the
  sentence that stops the second support mail.
- **One topic per file.** Two topics in one file means half of it is retrieved
  for the wrong question.
- **No `# ` in the body** — the title comes from the frontmatter. Start at `## `.
- **One language, yours.** She answers in the reader's language regardless.

The template ships six example files. Read one before you write, then **replace
them** — they describe the template, not the user's product.

## Step 4 — Check the format and the cost

```bash
node run.mjs kb-check
```

It names the file and the problem for anything malformed, counts the sections,
and prints what one answer costs at this size. Then:

```bash
node run.mjs test
```

## Step 5 — Ask her three real questions

**This step is not optional, and it is the one that finds the gaps.** A handbook
that passes `kb-check` can still be useless.

```bash
node run.mjs start
```

Open `/dashboard/chat` and ask:

1. Something the handbook covers → the answer must be right, and it must NOT
   name a document, a title or a file. The customer cannot open any of them —
   `content/knowledge/` is never served — so "you will find that in *Getting
   started*" is a broken link written out in words. If she cites, the persona in
   `lib/ai/prompt.ts` was changed; put the rule back.
2. Something a customer would ask that you did **not** write down → she must say
   she does not know. If she invents an answer instead, the handbook is
   contradicting itself somewhere; find it.
3. Something adjacent to money or access → she must be careful and point at
   support.

Every gap you find goes back into the files. Repeat until all three behave.

Finally, look at the server log once (`node run.mjs logs`) for the line
`[chat] … cache_read=…`. On the **second** message it must be greater than zero.
Zero means the handbook is being re-billed in full on every question — that is a
cost bug, and `docs/ai-chat.md` says where to look.

## Important rules

- **She may only say what is written down.** Every sentence she is expected to
  produce has to exist in a file. There is no other source — no database, no
  account data, no web.
- **She never sees the customer's account.** Balance, orders, plan and address
  are deliberately not sent to the API. So a question like "how many tokens do I
  have?" is answered with *where to look*, and the handbook must say where.
- **Nothing about money or access is decided by her.** She explains; the app
  decides, through `hasPlan()` / `entitlementsFor()`. A handbook sentence that
  promises access is a support incident waiting to happen.
- **Every extra file costs money on every answer.** The whole handbook is sent
  each time (cached, so cheaply — `docs/ai-chat.md`). Write what people ask
  about, not everything that is true.
- **Switching her off is legitimate.** `"enabled": false` and she is gone,
  including from the menu. An app whose handbook nobody maintains is better off
  without her.
- **Read `guardrails` before touching what she may access.** Her scope is a
  security question, not a content one.

## Next step

The handbook is content and stays alive: revisit it whenever the product gains a
feature or support answers the same question twice. Otherwise the path
continues as usual — **`security-gateway`** → **`performance-gateway`** →
**`compliance-check`** (which needs `docs/data-protection.md` §8 for the privacy
policy, because the assistant sends customer input to Anthropic) → **`go-live`**
→ **`go-to-market`**.
