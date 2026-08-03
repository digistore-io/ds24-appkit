<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The menus and the recorded no — verbatim examples

_Read from `build-app`, steps 1b, 1c and 1e: the wording for the brief
confirmations, the two menus with their presentation notes, the `docs/app.md`
entries that record a no, and what a chosen 1c row switches on._

## Step 1b — what the customer gets to SEE

The confirmation when `docs/product-brief.md` already answers it:

> "The brief says: *a finished sales page with a hero image*. So each page needs
> one picture — generated (~$0.05) or uploaded. Generated?"

The menu:

```
What should your customer get to see?

  1  a picture with every challenge message     ✅   upload or AI      ~$0.05 each
  2  "how far you have come" as a bar           ✅   your own data     nothing
  3  a welcome video on the start page               embed             nothing
  4  a picture the participant uploads themselves    upload            storage

  0  none of it — text only

Give me numbers, or say "you choose" and I take the ones marked ✅.
```

**Two archetypes have a single ✅**, and for them this is one row rather than a
menu — ask it as a yes/no and move on. The ✅ column is the starting point, not
the whole list: add a row when this particular app obviously wants one (a
participant uploading their own picture, say). What you must not do is drop the
step because the list is short.

The recorded no — the entry for `docs/app.md` under *Decisions worth
remembering*:

```md
- **No pictures in the challenge messages.** Decided on <date>: the vendor
  writes the messages themselves and has no picture material. If it comes
  back, the way in is `docs/visuals.md` → *Putting files in*.
```

That entry is the whole reason to ask rather than to assume: without it the
same suggestion arrives again in three sessions, and somebody spends the
conversation a second time.

## Step 1c — what the app DOES alongside the customer

The confirmation when `docs/product-brief.md` already answers it:

> "The brief says: *a coach that reads each day's answer*. So each day's
> submission goes to a model and comes back with a reply — about $0.01 per
> participant per day. Shall I build that?"

The menu:

```
What should your app DO alongside your customer?

  1  reads each day's answer and replies to it    ✅   their answer + the day    ~1 cent each
  2  looks back over the week, names what changed ✅   their entries that week   ~2 cents each
  3  checks a plan before they commit to it            the plan they wrote       ~1 cent each
  4  produces the finished thing they came for         what they filled in       ~3 cents each

  0  none of it — they do the work, the app keeps it

Give me numbers, or say "you choose" and I take the ones marked ✅.
```

The ✅ marks come from the archetype's row, so they move with it — the two above
are the Drip/Automation defaults. **The prices are an order of magnitude, not a
quote:** what one call actually costs depends on the company the `companion`
task is bound to and on how much the customer wrote, and it ships on `"auto"`.
`node run.mjs ai-check` prints the real figure for this installation. Say the
rough number rather than nothing — somebody deciding whether to buy this needs
to know it is cents and not euros — and say that it is rough.

**The rows are read off the archetype, not invented.** The ✅ column is the
starting point: add a row where this particular app obviously wants one, and say
so. What you must not do is drop the step because the list is short — for an
archetype with a single ✅ this is one row and a yes/no question, not a menu, and
it is still asked.

The recorded no:

```md
- **No AI companion.** Decided on <date>: the vendor reads the answers
  themselves, and a per-use cost is not wanted. If it comes back, the way in
  is `build-app` step 1c.
```

**Why a "no" is written down, and why it is easier to give here than in 1b.**
This menu costs money **on every use, for ever** — so "no" is a legitimate
answer to a real cost, not a failure to persuade. And an unrecorded "no" is
proposed again three sessions later by an agent that has no way of knowing it
was settled, which spends the vendor's conversation a second time on a question
they already answered.

What gets switched on for a chosen row: `"enabled": true` in
`config/ai-companion.json`, an entry in `lib/ai/companions.ts` (the
instruction, which plan gates it, what one use costs, and a `load()` that reads
**this member's** subject and nothing else), `<CompanionPanel …/>` on the page,
the disclosure (`<AiDisclosure surface="companion" />` — a legal requirement,
not a nicety), and the access decision: `hasPlan()` for a plan, `spendTokens()`
for metered use, never a billing table.
[`docs/ai-providers.md`](../../../../docs/ai-providers.md) → *Working alongside
your customer* is the reference.

## Step 1e — how should it look?

The yes/no question:

> "Should this app get a look of its own — an accent colour, a type pairing
> and a page style that fit <the product>? Costs nothing to run, about
> fifteen minutes. Or keep the default look?"

The recorded no:

```md
- **No custom identity.** Decided on <date>: the shipped look (indigo on
  neutral, Geist) stays. If it comes back, the way in is the skill `design`.
```
