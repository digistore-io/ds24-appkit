---
name: learning-activities
description: Gives an app the elements its customer DOES — a learning game, a check with a pass mark, an exercise that answers back — decides whether a course needs one and where, builds one on the shipped seam (registry entry + panel + server-side grading), gates and meters it, and checks one that already exists for the failure no other gate finds. Use this when the user says "my people never finish the course", "I want a quiz in lesson three", "can the course have a game", "how do I test whether they understood it", or when a course hands out videos and asks nothing back. For the course's overall shape use docs/courses.md; for a companion that talks, ai-companion.
requires: 0.9.0
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Interactive elements — what the customer does, and how it is judged

A course that is videos plus PDFs asks nothing of the learner. This skill
adds the asking half: a game, a check, an exercise — built on the seam the
template ships, where **the verdict is only ever reached on the server**.

The reference is [`docs/learning.md`](../../../docs/learning.md) — the five
recipes, the shape→element map, and what the catalogue refuses to promise.
**This skill does not repeat it.** Where a fact is needed, that file is named
and the conversation moves on.

## How to use this skill

Four items. You do not have to know which one you want.

| # | | What it does | Roughly |
|---|---|---|---|
| 1 | **`decide`** | should this course carry elements at all — and which, where | 10 min |
| 2 | **`build`** | build one recipe: registry entry, `grade()`, the game UI in the panel | 30–60 min |
| 3 | **`gate`** | who may use it, attempts, pass mark, and what one graded try costs | 10 min |
| 4 | **`check`** | the one that already exists: is the solution in the bundle, is it playable by keyboard | 15 min |

**How to dispatch:**

- If the user already said what they want ("a quiz in lesson three"), start
  that item. Do not show the menu first.
- Otherwise show the table, say that **`decide`** is where somebody who has
  not thought about it starts, and **wait**.
- *"My people never finish the course"* with nothing else: **`decide`**.
- **You run the commands** — through your Bash tool, not by telling the user
  to type them. That is the rule for the whole template.

## First, always

Look before you ask (`CLAUDE.md` → *How a skill works*):

- `lib/learning/activities.ts` — which entries exist. Empty is the shipped
  state, not a defect.
- `docs/app.md` — was a decision **against** elements recorded? Then say so
  and stop; a recorded "no" is an answer, not an opening position.
- Which course shape this app is (`docs/app.md`, or the tables in
  `db/schema.ts`) — the shape→element map in `docs/learning.md` says what
  fits, and shape 3's submission is **never** an element.

## 1 · `decide` — should it, and which?

The question, in the vendor's terms, as a numbered menu with cost per row
(the Step-1d grammar from `build-app` — "you choose" takes the defaults,
`0` is a real answer and goes into `docs/app.md` with its reason):

> Your course delivers — what should your customers DO in it?
>
> 1. a self-check closing each block/week (they see what stuck) — free per use
> 2. a learning game on the hard part (they practise, not re-read) — free per use
> 3. a graded exercise the app judges (code, structured tasks) — free, or tokens if a model judges
> 4. you choose — I take what fits your shape
> 0. none of it — the course stays as it is
>
> A game or check costs nothing per use unless a model grades it; what it
> costs you is the building of it, once.

Free, unlimited, unjudged practice is row 1 and 2 — **the framework's home
case**, `maxAttempts: null` and no pass mark. Never build a lighter grading
path beside the registry "because it is only practice": a second path is a
second place that must keep answers server-side.

Write the outcome into `docs/app.md` — the chosen elements with their units,
or the `0` with its reason.

## 2 · `build` — one recipe

Recipes A–C in [`docs/learning.md`](../../../docs/learning.md) are the spec;
the seam is three pieces and the order is fixed:

1. **The entry** in `lib/learning/activities.ts` — id (`[a-z0-9-]`, ≤ 40),
   `requiresPlan`, `costsTokens`, `maxAttempts`, `passMark`, `load()`,
   `grade()`. The file header's three rules are the contract; the third is
   the whole point: **the solution never leaves the server.** `load()` sends
   the questions, never the expected answers; `grade()` compares on the
   server; a checkpoint carries no score.
2. **The tables** the entry reads — per app, `build-app` Step 2 shape
   (`db-generate` → read → `db-migrate`).
3. **The surface** — `<ActivityPanel activityId subject>` around your game
   UI, which reaches everything through `useActivity()`. The panel header's
   five rules are the build spec for the UI; **keyboard first** is rule 1,
   and a time limit needs an alternative.

`subject` is the unit's slug — the same string a companion on that unit
uses. Then: `npm run typecheck && npm run test`, `node run.mjs start`, play
it yourself **with the keyboard only**, `node run.mjs errors`, and one entry
in `docs/app.md` (the access gate as code).

## 3 · `gate` — who, attempts, price

All registry fields, never props (a gate the browser sends is no gate):

- `requiresPlan`: a key from `config/digistore-products.json` — the course's
  own key, almost always. `null` is first-class and means every signed-in
  member: the free practice element. Never invent a fake key to avoid it.
- `maxAttempts` + `passMark`: a check judges, a game usually does not
  (`maxAttempts: null`). Refused attempts happen BEFORE grading and cost
  nothing.
- `costsTokens`: only when each graded try costs the vendor something (a
  model in `grade()`). The charge lands only on a recorded, final outcome —
  and then `billing-modes` is the skill for the token side.

## 4 · `check` — the one that already exists

For each entry in `ACTIVITIES`, in order:

1. **The solution's location.** Read `load()` and the client components: do
   the expected answers, the split, the correct options appear anywhere the
   browser can see — including checkpoint verdicts and the resume `state`?
   Build the app (`node run.mjs build`) and search the bundle for a known
   answer string. 🚨 CRITICAL if found: the element renders, returns 200,
   passes every test, and is worthless.
2. **The keyboard.** Play the element with the keyboard alone — every
   interaction, to the final verdict. ❌ HIGH if stuck: a consumer product
   without a key path is a BFSG defect, not a nice-to-have.
3. **The announcements.** Does the verdict reach a screen reader (the
   panel's live region or a Callout), and does the game announce its own
   state changes through `announce()`?
4. **The gates.** `requiresPlan` set? `maxAttempts` where the element
   judges? A model in `grade()` → disclosure mounted (`legal-check` knows)?

Findings in the house shape (🚨/❌/⚠️/ℹ️ · Where · Why · Fix · Evidence),
and the verdict goes dated into `docs/reports/` **every time** — a solo
`check` too. Anything that produces a verdict writes it down; "have we
already done that?" needs an answer next month.

## The rules

- **Anything the customer will SEE or DO is proposed, never assumed** — the
  menu in `decide`, once, before the data model.
- **A `0` is recorded and not argued with.**
- **Shape 3's submission is not an element.** A person reads it; the line is
  recipe C.

## What comes next

An element that judges belongs in the UX pass (`ux-gateway` — its keyboard
check now has something to check) and the security pass (`security-gateway`
— the bundle search). Name whichever has not run and offer to start it.
