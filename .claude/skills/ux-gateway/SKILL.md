---
name: ux-gateway
description: The experience check for this app. Looks at it the way a paying customer does — the first five minutes after a purchase, dead ends in the flows, actions that report nothing back, hand-built elements, unreadable text, wording nobody understands, keyboard and screen reader, small screens, work the customer hands over that nothing comes back from — judges each finding by severity, fixes what has to be fixed and writes a report. Use it after the app has pages and billing, before the security gateway, and whenever somebody says "my customers do not find their way around", "nobody uses it after they buy", "this looks unfinished", "is this understandable?".
requires: 0.4.0
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# UX gateway — look, judge, fix

The app works. This asks the other question: **can somebody who did not build it
use it, and does the person who just paid know what to do next?**

Those are not the same question as "does the page render", and nothing else in
this project asks them. `node run.mjs smoke` proves a page answers 200;
`vitest` proves a rule holds. Neither has ever opened the app and wondered what
the button does.

The method is: **look → judge → fix → look again.** Look means *open the page*,
not read the file. A finding you have not seen on a screen is a guess with a
severity attached to it.

The rules this measures against are **[`docs/ux.md`](../../../docs/ux.md)** and
`CLAUDE.md` § **UI**. Read `docs/ux.md` first — it is the single copy, this is
the audit against it. Where the two disagree, `docs/ux.md` wins.

## How to use this skill

Ten checks. You do not have to know which one you want.

| # | Check | What it looks at | Roughly |
|---|---|---|---|
| 1 | **`all`** | everything below, in the right order | 40–65 min |
| 2 | **`first-run`** | the first five minutes: purchase → dashboard. Does the empty app say what to do? | 10 min |
| 3 | **`flows`** | every path a member takes, including the unhappy ones. Dead ends | 10–15 min |
| 4 | **`feedback`** | does every action say what happened, and does destructive ask first | 5–10 min |
| 5 | **`kit`** | the design system: hand-built elements, hard-coded colours, both modes, small screens | 5 min |
| 6 | **`words`** | wording, i18n gaps, error codes shown raw, empty states with nothing in them | 10 min |
| 7 | **`access`** | keyboard, focus, names, contrast — WCAG 2.1 AA | 10 min |
| 8 | **`visuals`** | pages that hand the customer nothing but paragraphs; pictures that are broken, heavy, or contact somebody | 10 min |
| 9 | **`alongside`** | surfaces that take a customer's work and hand back nothing but a confirmation; a companion that is undisclosed or given away | 10 min |
| 10 | **`fix`** | fix the findings of the last report | depends |

**How to dispatch:**

- If the user already said what they want ("is the dashboard understandable?",
  "check the mobile view"), start that check. Do not show the menu first.
- Otherwise show the table, say that **`all`** is the one to run before a
  launch, and wait. A number, a name or a description all count.
- When somebody says "my customers do not get it" without more: **`first-run`**
  first. It takes ten minutes and it usually IS the answer.
- **You run the commands and you open the pages** — through your Bash tool and
  the browser, not by telling the user to do it. That is the rule for the whole
  template.

Every check ends the same way: findings with a severity → into the report →
offer to fix.

## Start the app. Always.

This gateway cannot be done from the files.

```bash
node run.mjs start          # DB + migrations + app
node run.mjs ux-check       # the measurable half — contrast, kit, names, menus
node run.mjs smoke          # every page answers
node run.mjs errors         # what the log caught behind a 200
```

`ux-check` is the narrow half and it takes two seconds: contrast of every token
pair in both modes, hard-coded colours, hand-built elements, icon buttons with
no name, images with no `alt`, pages under `/dashboard` that are in no menu.
**Run it first and fold its findings in** — they are already measured, so they
go straight into the report with a file and a line. One exception: its
**images with no `alt`** belong under check 8 with the rest of what goes wrong
with pictures, so that one fix does not become two findings.

Then open the app. Signed in as a **member**, not as the owner — the owner sees
an admin area the customer will never meet, and every judgement made from the
owner's session is made about the wrong app. In DEV a member costs nothing to
get: only the *first* account in a fresh app becomes `owner`
(`lib/users/bootstrap.ts`), so signing in through the development login with a
second address you make up gives you exactly what a customer has. Where there is
no browser, `node run.mjs user-create --email … --apply` writes the same row
(`member` is the default role).

**A note on what you can and cannot see.** If a browser tool is available, use
it and say so in the report. If it is not, say *that* — "judged from the code,
not opened" belongs in **Worth a look**, not in the count. An unseen page is not
a passed page.

**And if you have none, you can usually get one.** All four programs this
template supports speak MCP, and Playwright ships an MCP server that gives you a
browser — navigate, click, screenshot. That is a change to the user's own setup,
not to this app, so **offer it and let them decide**:

> "I can only judge these pages from the code. If you add the Playwright MCP
> server to <your program>, I can open them and actually look. Shall I walk you
> through it? It takes a minute, and it is useful well beyond this check."

If they say no, or it does not work, carry on and be honest in the report about
which checks were done on a screen and which were not. Checks 5 and 7 (`kit`,
`access`) are the ones that suffer most; `node run.mjs ux-check` already covers
their measurable half, and that half needs no browser at all.

## What counts as a finding

**Severity — what it costs if it stays:**

| | Severity | Meaning |
|---|---|---|
| 🚨 | **CRITICAL** | Somebody who paid cannot reach what they bought, or is told nothing at all about it. Fix before anything else — this is a refund in waiting. |
| ❌ | **HIGH** | Most people will be stuck, or will read a working app as broken. Fix before the launch. |
| ⚠️ | **MEDIUM** | Real friction, or an inconsistency people will notice. Fix soon. |
| ℹ️ | **LOW** | Polish. When you get around to it. |

**Confidence — only report what you can show.** A finding needs a file and a
line, a page you opened, or a number from `ux-check`. "This could be confusing"
with nothing under it goes into **Worth a look** at the end, not into the count.
This matters more here than anywhere else in the template: taste arguments are
cheap to produce and expensive to read, and a report full of them is a report
nobody opens twice.

**Never report a deliberate decision as a defect.** Three that come up every
time, all documented, none of them findings:

- The app sets **no cookie banner** and must not grow one (`docs/compliance.md`).
- Sign-in is a **magic link** by default; a password is optional on purpose.
- A **checkbox or segmented control built by hand** — the kit ships none, and
  `ux-check` reports those as a warning rather than a failure for that reason.

**The format of a finding — the same as in `security-gateway`:**

```
❌ HIGH — Nothing on the dashboard says the purchase worked
   Where:    app/dashboard/page.tsx:118
   Why:      The confirmation is a toast that clears its own parameter, so a
             customer who reloads — which is what people do when they are not
             sure it worked — sees an overview identical to the one before
             they paid.
   Fix:      An onboarding step whose `done` is read from entitlementsFor(),
             so the state itself says it. docs/ux.md §1.
   Evidence: Bought as member@test, reloaded /dashboard, nothing named the plan.
```

Four lines, always in that order. **Why** says what it costs the person, in
plain words — not "poor affordance". **Fix** is a change someone can make.

## 1 · `all` — the full pass

In this order. It is not arbitrary: the checks that decide whether the app is
usable at all come before the ones that decide whether it is pleasant.

1. **`first-run`** — the moment the app is judged on. If this is wrong, nothing
   further down matters.
2. **`flows`** — the paths out of it, including the unhappy ones.
3. **`feedback`** — whether the app answers when spoken to.
4. **`kit`** — cheap, measured, and it explains half of "looks unfinished".
5. **`words`** — after the structure, because rewording a dead end does not fix it.
6. **`access`** — independent of all of the above; run it whenever.
7. **`visuals`** — second to last, because it asks whether the app hands over
   anything worth looking at, and that is a question about the product rather
   than about the interface. It is also one of the two whose fixes are new
   features, so it is one somebody may reasonably defer.
8. **`alongside`** — last, and beside `visuals` for the same reason. `visuals`
   asks whether there is anything to look at; this asks whether anything comes
   **back**. Both are questions about the product rather than about the
   interface, both have fixes that are new features rather than repairs, and
   both are ones somebody may reasonably defer.

Then: one report, one summary, one offer to fix.

## 2 · `first-run` — the first five minutes

**Do this as the customer, in order, and write down what you did not
understand.** Not what you would improve — what you did not understand. The
second list is short and it is the one worth acting on.

The walk:

1. Land on `/` as a stranger. What is this, who is it for, what does it cost?
2. Go to `/plans`. Is it clear what each plan gives you?
3. Buy one (test purchase — `setup-digistore` explains the cookie), land back
   through `/optin/[orderId]`.
4. **Stop on `/dashboard` and look at it as somebody who has just paid.** Does
   anything on this page confirm the purchase? Does anything say what to do
   next? Now **reload it** — is that still true?
5. Do the thing the app is for. Count the clicks and the guesses.

What to look for, and what the template already gives you:

| Question | Where the answer lives |
|---|---|
| Does the app say what to do first? | `<OnboardingChecklist>` on `app/dashboard/page.tsx` — steps derived from real state, `lib/onboarding/rules.ts` |
| Do the steps mean anything for THIS app? | the two shipped steps (buy a plan, top up) are a **blueprint** and are meant to be replaced |
| Does the purchase survive a reload? | it has to be visible in the app's state, not only in the toast (`docs/ux.md` §2) |
| Is every empty list explained? | `<EmptyState>` with a sentence and, where there is one, a button |

**The finding that is almost always there on a young app:** the checklist still
holds the two shipped steps, so the app's only advice to a new customer is "buy
something" — while the thing they bought sits behind a menu entry nobody
mentioned. That is ❌ HIGH, and the fix is three lines in
`app/dashboard/page.tsx`.

## 3 · `flows` — every path, including the unhappy ones

Walk each one and ask at every screen: *what now?* A screen with no answer is a
dead end, and dead ends are where customers write to support.

The paths that exist in every app built on this template:

| Path | The screen that usually has nothing on it |
|---|---|
| Sign in for the first time | the dashboard before anything has been bought |
| Buy → return from checkout | `/dashboard` right after `/optin/[orderId]` |
| Buy a second plan / upgrade | a member holding two plans at once, briefly, or neither |
| A payment is missed | the plan simply vanishes from the page |
| The balance runs out mid-action | the refusal, with no way to top up on it |
| A refund | access ends, and nothing says why |
| Cancel a subscription | access runs on — does the app say that, or read as revoked? |

**The missed payment is the one to check by hand.** `hasPlan()` and
`entitlementsFor()` both stop reporting a suspended plan, so unless the page
uses `pausedKeys()` (`lib/entitlements/rules.ts`) the customer sees their plan
disappear with no explanation and reads it as an account closure. It is 🚨
CRITICAL when it is silent: they paid, and the app is telling them they did not.

For each dead end, name the screen and the sentence that is missing.

## 4 · `feedback` — does the app answer when spoken to

Three mechanisms, and between them they cover every case
(`CLAUDE.md` § **UI**, rule 1). What to check:

- **Every Server Action's result reaches a person.** Read each
  `app/**/actions.ts`, then find where its `state` is rendered. An action whose
  page never calls `useActionToast(state)` and never shows a `<Callout>` is
  silent on success AND on failure — ❌ HIGH.
- **Everything that ends in `redirect()` says so on the other side.** This is
  the one that goes missing, because it works for whoever wrote it.
- **A message never travels in the URL.** The parameter carries an id, the
  receiving page resolves it scoped to the session. A page rendering
  `searchParams.message` is 🚨 CRITICAL — anyone can hand somebody a link that
  makes your app say what they typed.
- **Everything destructive asks first**, through `<AlertDialog>`, naming what
  gets hit, with a red confirm button. A `confirm()` or a bare button is ❌ HIGH.
- **Nothing can be submitted twice.** `disabled={isPending}` on anything that
  charges, mails or bills. `spendTokens` is deliberately not idempotent.
- **Slow things say they are working.** A `<Skeleton>`, or a pending state on
  the button.

## 5 · `kit` — the design system

Mostly measured. Run `node run.mjs ux-check` and fold the findings in; then look
at the two things it cannot see.

`ux-check` settles: hard-coded palette colours, raw `<button>`/`<input>`/
`<select>`/`<textarea>`/`<table>`, pages under `/dashboard` that are in no menu,
and every token pair's contrast in **both** modes. Each comes with a file and a
line, so each goes straight into the report. Its **images with no `alt`** are
check 8's — see there.

What you still have to look at yourself:

- **Dark mode, by eye.** Tokens make it work; a `<div>` with a hand-picked
  shadow or an image with a white background still falls over. Switch the theme
  and look at every page you opened.
- **Small screens.** Resize to ~380 px. Tables that do not scroll, dialogs whose
  submit button sits under the keyboard, fixed widths that scroll the whole
  page — `docs/ux.md` §6. Roughly half of Digistore24's traffic is a phone, so
  this is not an edge case.

## 6 · `words` — is it written for the customer

- **Is anything visible not in both message files?** `i18n/messages.test.ts`
  catches a missing key, not a German sentence sitting in a `.tsx`. Grep for
  string literals in JSX.
- **Does any error reach a person as a code?** `lib/` returns codes and the
  Server Action translates them. A page rendering `selfDelete` is ❌ HIGH.
- **Is any identifier on a customer-facing page?** Order ids, member ids and
  product keys belong in support tools.
- **Does every empty state say something?** A heading and a blank space is not
  an empty state.
- **Read the five most important sentences out loud** — the plan names, the
  purchase confirmation, the two most common errors, the destructive dialog. If
  a sentence describes the database rather than the customer's situation,
  rewrite it.

## 7 · `access` — usable without a mouse

The legal position is one paragraph in `docs/ux.md` §5 and it decides how hard
to push: most operators here are micro-enterprises and exempt from the BFSG
today, in scope the year they grow. Report findings either way; let the severity
follow the app, not the statute.

Measured by `ux-check`: contrast in both modes, the focus ring at 3:1, icon
buttons with no name.

**Where the app carries interactive elements** (`ACTIVITIES` in
`lib/learning/activities.ts` — a game, a check, a graded exercise), this
check gets a second half that no command measures: **play every element with
the keyboard alone, to the final verdict.** A drag without a key path is the
naive way to build a game and a BFSG defect in a consumer product; a time
limit without an alternative is a wall. The verdict must reach a screen
reader (the panel announces through its live region — verify it does, and
that the game announces its own state through `announce()`). ❌ HIGH where
stuck: unlike a contrast ratio, there is no partial credit on "cannot finish
the exam without a mouse". The build-side rules are the five in the panel
header (`components/activity-panel.tsx`); the deeper audit is the skill
`learning-activities`, item `check`.

`ux-check` also measures **images with no `alt`** — but file that finding under
check 8 with the rest of what goes wrong with pictures. One fix should not
produce two findings in one report.

By hand, and every one of these is a real failure rather than a nicety:

- **Tab through one whole page.** Can you reach every control, and can you
  always see where you are? A focus ring that is invisible on one surface is
  ❌ HIGH — it is the only thing a keyboard user has.
- **Open a dialog with the keyboard, close it with `Esc`.** The kit does this;
  a hand-built overlay does not.
- **Is anything said with colour alone?** A red dot means nothing to a
  colour-blind customer and nothing at all to a screen reader.
- **Do the headings step down** (`h1` → `h2` → `h3`) rather than being picked
  for size? `<PageHeader>` gives you the `h1`.
- **Does every form field have a real `<Label htmlFor>`?** A placeholder is not
  a label — it disappears exactly when somebody needs it.

## 8 · `visuals` — is there anything to look at?

**What this check is for.** An app can pass every check above and still hand its
customers paragraphs. That is not an accessibility failure or a wording failure;
it is the product being one step short of what somebody paid for. This check
finds it in an app that already exists — `build-app` step 1b is where it is
decided for one that does not.

**Read `docs/app.md` FIRST, and read it properly.** Its *Decisions worth
remembering* section may already say "no pictures in the messages, deliberately,
because …". If it does, that is not a finding — it is an answer, and reporting
it anyway is how this gateway teaches people to stop writing decisions down.
Say you found it, and move on.

Then walk the app's **result surfaces**: the places where a customer is handed
something. Not every page — a settings form is a settings form.

*(This check audits against [`docs/visuals.md`](../../../docs/visuals.md) rather
than `docs/ux.md`, which has nothing to say about pictures. And `Figure`,
`generateImage()` and the catalogue all arrived with template 0.7.0 — on an
older copy the rows that name them never fire, and the rest applies unchanged.)*

| Severity | What | Why |
|---|---|---|
| ⚠️ MEDIUM | A result surface whose whole output is prose, and nothing in `docs/app.md` says that was chosen | The fix is a catalogue entry, named — see below |
| ❌ HIGH | An image with no alternative text and no `decorative` | A screen reader reads the filename instead |
| ⚠️ MEDIUM | An image that carries its own light background, seen in dark mode | Switch the theme and look; nobody does this while building |
| ⚠️ MEDIUM | An image not going through `next/image` | A phone downloading four megabytes to show two hundred pixels, on somebody else's data plan. Note it here and leave the number to `performance-gateway`, which measures what it costs — one fix, one finding |
| ⚠️ MEDIUM | An image that scrolls — a picture inside an `overflow-auto` container | A too-big picture is scaled to the container's width (`w-full h-auto`, crop with `overflow-hidden`), never panned. Sideways scrolling is for tables (`docs/ux.md` → *Small screens*) |
| ⚠️ MEDIUM | A diagram identical for every customer — a flow chart of the app's own process, boxes and arrows beside a form | Decoration wearing a chart's clothes (`docs/visuals.md` → *What NOT to do*). Remove it, or replace it with the customer's own data; at most one survives, and only where somebody must understand a sequence before they act |
| 🚨 CRITICAL | An `<iframe>` at a video host with no consent gate in front of it | It contacts Google or Vimeo before the visitor agreed to anything — § 25 TDDDG. `compliance-check` reports the same thing from the legal side |
| ❌ HIGH | A generated image with an empty `alt` | It should be impossible — `generateImage()` requires one, so somebody has written a row by hand |

**The fix names the entry, not the problem.** "Add an image" is not a finding
anybody can act on. [`docs/visuals.md`](../../../docs/visuals.md) has a row per
app shape — *a chart above the table*, *a result card instead of a number*, *the
message with a picture* — and the fix quotes the one that applies:

```
⚠️ MEDIUM — the monthly report is a table and nothing else
Where:    /dashboard/reports
Why:      a customer opening it monthly cannot see at a glance whether the
          month was good. The numbers answer "what exactly"; nothing answers
          "how is it going".
Fix:      docs/visuals.md → "a report as a table" → a bar chart above it. The
          table stays.
Evidence: page renders 1 heading, 1 table, 0 images or charts.
```

Some of it is countable — `grep -rn "<img" app components` for pictures outside
`Figure`, `grep -rn "youtube.com\|player.vimeo.com" app components` for the
embed, `grep -rn "overflow-auto\|overflow-x-auto" app components` and then
looking at what sits inside each hit (a table is right, an image is the
finding) — and the rest is opening the pages and looking, in both themes.

**Where this check does NOT go:** decoration. A stock photograph on a settings
page is not a finding fixed — `docs/visuals.md` says why, under the catalogue.

## 9 · `alongside` — does anything come back?

**What this check is for.** An app can pass every check above and still hand its
customers a form. Check 8 asks whether there is anything to look at; this one
asks whether anything comes **back**. The case it was written from: a customer
writes three paragraphs about their day into a paid challenge, and the app
replies *"saved"*. Nothing reads it, nothing returns tomorrow, and the
subscription is paying for a text box. This check finds it in an app that
already exists — `build-app` step 1c is where it is decided for one that does
not.

**Two commands first**, and neither needs a browser. Their findings are already
measured, so they go straight into the report with a command as evidence:

```bash
node run.mjs legal-check    # a companion switched on and undisclosed
node run.mjs ai-check       # a key configured, the layer called from nowhere but support
```

`legal-check` settles the disclosure — which surface, which language, and what is
missing. `ai-check` settles the whole-app observation at the bottom of the table.

**Read `docs/app.md` FIRST, and read it properly.** Its *Decisions worth
remembering* section may already say "no AI companion, deliberately, because …".
If it does, that is not a finding — it is an answer, and reporting it anyway is
how this gateway teaches people to stop writing decisions down. Say you found it,
and move on. `docs/product-brief.md` is the second place to look and the first in
time: an `Alongside the customer:` line there says what was decided when the
product was worked out.

Then walk the app's **work surfaces**: the places where a customer hands
something over — a submission, an answer, a photo, a plan. **Not every form.** A
settings page, an address, a payment method, a support message: the customer is
not handing over their *work* there, and a confirmation is the right answer.

*(`askCompanion()`, `<CompanionPanel>`, `config/ai-companion.json` and the
catalogue all arrived with template **0.8.0** — on an older copy the three rows
that name them never fire, and the work-surface row applies unchanged, back to
0.4.0. That row is also the one that matters most on an old app: it needs no
companion code at all, only a page and a `docs/app.md`. Which is why the
`requires:` on this skill stays at 0.4.0 — bumping it would withhold all nine
other checks from an app on 0.6.0 over one row it could not use anyway, and
withhold precisely the row it could.)*

| | Severity | What |
|---|---|---|
| ❌ | **HIGH** | A companion is switched on and the customer is not told a model reads what they write. `node run.mjs legal-check` names it and names the fix. **The most severe finding this check raises** |
| ❌ | **HIGH** | A companion whose registry entry has `requiresPlan: null` **and** `costsTokens: 0` — every signed-in visitor spends the vendor's money on it, once per use, for ever |
| ⚠️ | **MEDIUM** | A surface takes a customer's work and returns nothing but a confirmation, and nothing in `docs/app.md` says that was chosen |
| ℹ️ | **LOW** | A provider key is configured and nothing outside the support chat calls the AI layer. `ai-check` prints it under *Worth knowing* — a whole-app observation, **one line, once**, and it does not fire on an app with no key |

**The disclosure row is quoted, never re-derived.** The fix is
`<AiDisclosure surface="companion" />` on the page the customer writes into, plus
*"`node run.mjs legal-check` says which surface and which language"* — and
nothing about the message key or the wording rule. One copy of that rule exists,
in `lib/ai/disclosure.mjs`, precisely because it had been written twice; a third
copy in a skill would be the same mistake in prose. It is ❌ HIGH and not
🚨 CRITICAL deliberately: `compliance-check` owns Art. 50 and its own ladder puts
an undisclosed AI at HIGH, and two reports of the same week contradicting each
other is worse than one being a notch low.

**The gating row's evidence is a file and a line** — the two fields in the
entry, read out of `lib/ai/companions.ts`. A companion gated by a **token
package** is a different thing and not this check's: `companionProblems()`
already refuses that config, because `hasPlan()` answers `false` for a balance
for ever.

**The fix names the entry, not the problem.** *"Build a companion"* is not
something anybody can act on.
[`docs/ai-in-product.md`](../../../docs/ai-in-product.md) has a row per app shape
— quote the one that applies:

```
⚠️ MEDIUM — the daily challenge takes an answer and gives back "saved"
Where:    app/dashboard/challenges/[day]/ui.tsx:74, actions.ts:31
Why:      a customer writes three paragraphs about their day and the app
          replies with a toast. Nothing reads it, nothing comes back
          tomorrow, and the subscription is paying for a text box.
Fix:      docs/ai-in-product.md → 2.1 "the companion that walks a course or a
          challenge with them" → a companion on the submission, gated by
          hasPlan(memberId, "coach_monatlich"). The stored answer stays.
Evidence: the action inserts one row and returns { ok: true }; the page renders
          the list and the form and nothing else.
```

Some of it is countable — the two commands above, and reading
`lib/ai/companions.ts` — and the rest is opening the pages, signing in as a
member and **doing the thing the app is for**. `node run.mjs ux-check` measures
nothing for this check, deliberately: whether a surface takes a customer's
*work* or a *setting* is a question about what the app is for, and a scan for
"an action that inserts a row and returns `{ ok: true }`" matches every settings
form in the app — which is the **passing** state of check 4. A check that fires
on the thing another check requires is not a weak check, it is a wrong one.

**Where this check does NOT go:** settings, addresses, payment methods, support
messages — a confirmation is the correct answer to those. And it does not go
near **building** anything; see STOP below.

**`ai-companion` → `check` looks at one companion — the one somebody is building
or has just built — and fixes it. This walks the whole app and finds the surfaces
where there is no companion at all**, which is the case that has nothing for
`ai-companion` to be pointed at yet. So the ⚠️ MEDIUM row is this check's alone,
and on the two companion rows this check **hands over rather than duplicates**:
report it, name the fix, and send the user to `ai-companion` → `check` for the
instruction, the `load()` scoping, the ceiling and the cost — four things a UX
gateway has no business judging.

## 10 · `fix` — fixing what was found

1. **CRITICAL and HIGH first**, in the order they are in the report.
2. **Fix it where the rule lives**, not where it showed up. A missing
   acknowledgement is a step in the checklist, not a sentence pasted onto one
   page; a wrong colour is a token, not a class.
3. **Use the kit.** Anything missing: `npx shadcn@latest add <component>`.
4. **Both language files. Both modes.** Every time.
5. **Look at it again** — open the page, do the thing, and re-run
   `node run.mjs ux-check`. Then `node run.mjs test` and `node run.mjs smoke`.
6. **Update the report** — what was fixed, what stays open, and why.

Anything that needs a decision rather than a change (a different price story, a
plan that genuinely has no content behind it, a feature the app does not have)
goes back to the user as one clear question.

## The report

Every run writes one, whether it found anything or not. That is what makes "did
we already look at this?" answerable in three months.

Write it to **`docs/reports/ux-YYYY-MM-DD.md`** (add `-2`, `-3` if the day
already has one). Create the folder if it is not there.

```markdown
# UX report — 2026-07-27

Checks: first-run, flows, feedback, kit, words, access, visuals, alongside
Seen:   opened in a browser, signed in as a member        (or: judged from code)
App:    local, commit a1b2c3d

🚨 CRITICAL 0   ❌ HIGH 3   ⚠️ MEDIUM 4   ℹ️ LOW 2   ✅ accepted 1

## Findings
(each in the four-line format, most severe first)

## Fixed in this run
(what changed, with the file)

## Open
(what stays, and the reason — a decision, a cost, a dependency)

## Worth a look
(what was not opened, and the low-confidence observations — no severity, no count)

## Accepted deviations
(from docs/reports/ux-accepted.md, with the reason and who accepted it)
```

Then say it out loud, in three or four sentences: what a new customer meets
today, what is in their way, what was fixed, and whether you would put this in
front of a paying stranger. That last one is a straight answer — "yes", or "no,
because X".

## Accepted deviations

Some of it is deliberate — a house style, a control the kit does not ship, a
deliberately sparse page. Rather than rediscovering it every run, it goes into
**`docs/reports/ux-accepted.md`**:

```markdown
| Finding | Where | Why accepted | By | Date | Review |
|---|---|---|---|---|---|
| Hand-built checkbox | app/plans/page.tsx | the kit ships none | Anna | 2026-07-27 | when shadcn checkbox is added |
```

**Two records, and check 9 is the first thing here that reads both.** They mean
opposite things and must not be merged:

- **`docs/app.md`** holds the decision *against building* something — "no
  companion, deliberately, because …". That is what makes a check **silent**, and
  it is written there by `build-app`, not by this gateway.
- **`docs/reports/ux-accepted.md`**, below, holds a finding a check **did** raise
  that the user then accepted. The realistic one for check 9 is a companion left
  deliberately free in a free tier — the ❌ HIGH gating row, accepted with a
  reason.

An accepted deviation is **not counted** in the totals and appears in its own
section. Only the user accepts one — never you, and never silently. A CRITICAL
is not accepted: a customer who cannot reach what they paid for is not a matter
of taste.

## STOP — ask a person

Do not decide these on your own:

- **Rewording anything about price, plan contents or what a purchase includes.**
  That is the offer, and it is on file at Digistore24 as well. Wrong wording
  here is a legal problem, not a UX one.
- **Removing or hiding a legal page, a consent purpose or the AI disclosure.**
  `compliance-check` owns those, and Art. 50 AI Act is not a layout question.
- **Changing what a plan unlocks** to make an empty page look fuller.
- **A redesign.** This gateway fixes findings; it does not restyle an app
  somebody chose the look of. If the answer is "this needs to look different",
  say so and let the user decide.
- **Building the visual features check 8 proposes.** Reporting that a page hands
  out nothing but text is this gateway's job; deciding to build a chart, a
  result card or an image feature is the user's, and it is a feature rather than
  a fix. Report it, name the catalogue entry, and hand over to **`visuals`** if
  they want it. A gateway that quietly grows the product is one nobody can let
  run unattended.
- **Building the companion check 9 proposes.** Reporting that a surface takes a
  customer's work and gives nothing back is this gateway's job; deciding to build
  a companion is the user's, and it is a feature rather than a fix — one that
  costs money on **every use** and sends what the customer wrote to a third
  party. Report it, name the catalogue entry, and hand over to **`ai-companion`**
  if they want it. The same goes for switching `config/ai-companion.json` on, and
  for changing what a companion is gated by — that is *"Changing what a plan
  unlocks"* above, with a bill attached.

## Next step

After a green UX gateway: **`security-gateway`** — the same shape, the same
report, for safety instead of clarity. Then `performance-gateway`.

Run this one again after any larger change to the interface, and `go-live`
brings it back for the live instance — a local pass proves the pages, not the
thing your customer actually opens.
