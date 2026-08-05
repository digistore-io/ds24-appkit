---
name: build-app
description: THE ENTRY POINT for this template — use this skill as soon as the user wants to start building, wants to get oriented, or opens with something vague ("how do I start?", "Build my app", "what can I do here?"). First clarifies whether a product idea already exists (otherwise hands over to market-research), assigns the project an archetype, creates the data model and pages, and then hands over to setup-digistore for payment. The rules from guardrails apply alongside.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Building a SAAS app on this template

You are building a **SAAS application that bills through Digistore24**. This
template already ships with sign-in, database, design system and the complete
Digistore integration. All you have to do is describe what your app should do.

**Always a SAAS app — never a single web page.** A landing page, a one-pager, a
company or portfolio site is not a valid result here: without user accounts, a
protected area and purchase-dependent access there is nothing Digistore24 could
bill for. If the user asks for that, ask back what people are supposed to *buy*
and then *use* — the page they want is almost always the sales page of the app
and belongs in it as `app/page.tsx` plus `app/plans/page.tsx`, not as a
separate project alongside. Details in `CLAUDE.md` ("What gets built here —
without exception"). Building that sales page is its own station — the skill
**`salespage`**, scheduled in step 6 — because what ships at `/` is a
placeholder that describes the template, and re-texting it is not a salespage.

**Exception: test apps.** If someone only wants to try things out ("show me
'Hello World'", a small page to get a feel for it), then build that directly as
a page under `app/` — without step 0, without `market-research`, without asking
about the product. Only once it runs, offer in one sentence whether it should
turn into something sellable. Offer it, don't push.

## Step 0a — Prove the machine works, before the first file

**This is a command, not a glance.** Unless the session greeting already says
`[Setup: ok — verified <date>]`, your first tool call of this build is:

```bash
node run.mjs doctor --json
```

Read the answer, and there are only three:

| | |
|---|---|
| **the command does not exist** — "command not found", "not recognized" | there is no Node on this machine. Skill **`setup-machine`**, step 0. **STOP** |
| `"ok": false` | skill **`setup-machine`**. **STOP** |
| `"ok": true` | one sentence, and on to step 0 |

**STOP means no file is written until it is solved** — not "note it and carry
on". A machine without Node lets a whole app come into being and only gives way
at the first test, which is the failure this template warns about most loudly: a
confident report and a page that never loads.

Why a command and not a look at the greeting: **a missing line is not a signal.**
The greeting is printed by a Node program, so a machine without Node prints
nothing at all — and "nothing" reads like "all fine". A command that does not
exist does not read like that. (There is a second, shell-only hook that says it
outright, but do not rely on having seen it.)

Two sentences on all of this, no more, and only when it applies. Somebody who
came to build an app does not want a lecture about Docker; they want it to work.

## Step 0 — The switch: is the idea already there?

This is the **single entrance** of the template. The user doesn't have to know a
second skill — you ask exactly one question first:

> "Do you already have a concrete idea of what your app should do — or shall we
> find one together that fits your experience and your reach?"

- **Idea is there** (the user can say in 1–2 sentences what the app does and for
  whom) → write those sentences down as a **minimal product brief** in
  `docs/product-brief.md` — the idea as the user said it, plus who it is for
  and, if they volunteered it, how it bills. Half a page at most, no research,
  no sources, and **none of the labels** `market-research` writes (their
  absence is how steps 1b/1c know those questions are still open). Then
  continue with step 1. The point: the first written record of what is being
  built must exist BEFORE the code does — an app whose requirements live only
  in a chat transcript gets rebuilt from memory in session three.
- **No idea, or a vague one** ("don't know", "something with…", an industry) →
  start the skill **`market-research`**. It interviews the user about expertise
  and reach, researches a target audience along with their challenges and
  delivers a concrete product proposal + product brief (`docs/product-brief.md`).
  After that the user comes back here, and you continue with step 1.

Don't guess. A vague answer is a no — better to turn off into research once too
often than to build an app nobody buys.

- **Only trying things out** ("Hello World", a small test page) → the question
  is dropped. Build right away, see "Exception: test apps" above. Putting a
  switch in front of a two-liner drives away exactly those users who are only
  just getting to know the system.

If the user only wants to **get oriented** ("what can I do here?", "how do I
start?"), briefly give them the path (idea → build → payment → security → legal
→ live → marketing, see `README.md`) and then ask the same question.

## Step 1 — Choose an archetype

Ask the user (or work out) what the app is at its core. There are five
archetypes: **Content-Access** (unlock digital content/courses after purchase),
**Drip/Automation** (send recurring messages after purchase), **Gated-Tool**
(provide a tool/feature for buyers only), **Membership** (manage
membership/subscription) and **Usage/Tokens** (bill by usage, e.g. AI usage).

**Read the full table in [`references/archetypes.md`](references/archetypes.md)
before deciding, and put the choice to the user** — it holds what to build per
archetype, the ✅ defaults steps 1b–1d propose, and the Gated-Tool warnings.

All archetypes use the same base: **auth (`auth.ts`)** for who is signed in, and
the **entitlement API** (`lib/entitlements/manage.ts`) for what they may use.
The Digistore IPN feeds both — it records the payment and maintains the grant
behind it. Reference: `docs/entitlements.md`.

**The archetype answers one more question, so answer it now:** does this app
sell **plans**, **tokens**, or **both**? Write it into
`config/digistore-products.json` — one line, and you can set it before a single
product exists:

```json
{ "billingMode": "subscriptions" | "tokens" | "both", "products": { … } }
```

Which archetype sells which, why the shipped `"both"` should not simply stay
(the mode is display-only and safe to set), and deleting the sample products:
the billing-mode section of [`references/archetypes.md`](references/archetypes.md).
Everything else about billing is the `billing-modes` skill.

## Step 1b — What the customer gets to SEE

**Before the data model, not after the pages.** Whether a challenge message can
carry a picture is a column before it is a layout, and finding that out after
`db-migrate` means a second migration for something the first one could have had.

Read the ✅ column of the archetype's row in
[`references/archetypes.md`](references/archetypes.md) and put it to the user
as a numbered menu — then **wait**. The rule this follows is in `CLAUDE.md` → *How a skill
works* (**"Anything the customer will SEE, and anything the app will DO for
them, is proposed, never assumed"**); what is below is the first half of that
rule for this step, and Step 1c is the second.

**If `docs/product-brief.md` has an `Output artifact:` line, this is not an open
question any more.** Read it, say what it implies, and ask for confirmation
instead of a choice — the worked wording is in
[`references/menus.md`](references/menus.md).

**Otherwise, the menu.** Say what each row costs and where it would come from —
those two are what somebody actually decides on, and neither is in the archetype
table. `node run.mjs ai-check` prints what one generated picture costs today;
[`docs/visuals.md`](../../../docs/visuals.md) is where the rest of it is. The
verbatim menu to show is in [`references/menus.md`](references/menus.md).

**Two archetypes have a single ✅** — then this is one row and a yes/no, and
rows may be added (notes in [`references/menus.md`](references/menus.md)); what
you must not do is drop the step because the list is short.

Three answers, and the last two are as real as the first:

- **Numbers** → exactly those, and nothing else.
- **"you choose"** → the ✅ rows, no further question. Offer it in the menu
  itself every time; somebody who trusts the suggestion should not have to read
  four rows to say so.
- **`0`** → text only, and **write it into `docs/app.md`** under *Decisions
  worth remembering* — the verbatim entry, and why it is the whole reason to
  ask rather than to assume, is in [`references/menus.md`](references/menus.md).

**Two things not to do here.** Do not ask what a picture should *look* like —
that is the customer's business, at the moment they use the app, not a decision
to make at build time. And do not turn a `0` into a negotiation: it is an
answer, and a skill that argues with it teaches people to stop answering.

**Skip this step entirely for an experiment.** Same boundary as the SAAS rule in
`CLAUDE.md`: somebody trying the template out gets the small thing they asked
for, without a menu.

Whatever is chosen, the code for it exists — `docs/visuals.md` is the reference
(store, upload, generation, and the recipes for charts and video), and
`node run.mjs media-check` says whether this machine can store a file at all.

## Step 1c — What the app DOES alongside the customer

**Still before the data model.** A companion needs columns — the submission it
reads, the subject its turns hang on — and finding that out after
`node run.mjs db-migrate` is a second migration for something the first one
could have carried.

The rule this follows is the same one Step 1b follows — `CLAUDE.md` → *How a
skill works*. What is below is that rule for this step.

**If `docs/product-brief.md` has an `Alongside the customer:` line, this is not
an open question any more.** Read it, say what it implies, and ask for
confirmation instead of a choice — the worked wording is in
[`references/menus.md`](references/menus.md).

**Otherwise, the menu.** Read the ✅ column of the archetype's row in
[`references/archetypes.md`](references/archetypes.md) and put it to the user —
then **wait**. Each row says three things, and only the first of them is in the
archetype table: what the customer gets, which of their data the call needs, and
what one use costs. `node run.mjs ai-check` prints what one companion call costs
today; [`docs/ai-providers.md`](../../../docs/ai-providers.md) is where the rest
of it is. The verbatim menu — its prices are an order of magnitude, said as
rough numbers — is in [`references/menus.md`](references/menus.md).

**The rows are read off the archetype, not invented** — the notes on adding one
and on a single-✅ archetype are in [`references/menus.md`](references/menus.md);
what you must not do is drop the step because the list is short.

Three answers, and the last two are as real as the first:

- **Numbers** → exactly those, and nothing else. Each one becomes an entry in
  `lib/ai/companions.ts` and a `<CompanionPanel companionId subject />` on the
  page that carries it. One surface, several call sites — never a second panel.
- **"you choose"** → the ✅ rows, no further question. Offer it in the menu
  itself every time; somebody who trusts the suggestion should not have to read
  four rows to say so.
- **`0`** → nothing is built, and it is **written into `docs/app.md`** under
  *Decisions worth remembering* — the verbatim entry, and why a "no" is easier
  to give here than in 1b (this menu costs money on every use, for ever), is in
  [`references/menus.md`](references/menus.md).

**And it is not negotiated.** Same rule as Step 1b: a `0` is an answer, and a
skill that argues with it teaches people to stop answering.

**Two things not to do here.** Do not ask which model or which company — that is
`config/ai-models.json` and the skill `ai-providers`, the shipped binding is
`"auto"`, and it runs on whichever key is in the `.env`. And do not build the
companion now: this step decides, Step 2 gives it its columns and Step 3 its
surface. A panel built before the data model is the second migration this step
exists to avoid.

**Skip this step entirely for an experiment.** Same boundary as Step 1b and as
the SAAS rule in `CLAUDE.md`: somebody trying the template out gets the small
thing they asked for, without a menu.

Whatever is chosen, the code for it exists — what a chosen row switches on
(the config switch, the registry entry with its member-scoped `load()`, the
panel, the legally required disclosure, and the access decision: `hasPlan()`
for a plan, `spendTokens()` for metered use, never a billing table) is listed
in [`references/menus.md`](references/menus.md), and `node run.mjs legal-check`
reports a companion switched on without its notice.

## Step 1d — What the customer DOES, and how it is judged

The third of the four sibling questions, in the same grammar as 1b and 1c, and
**only where the archetype's row in `references/archetypes.md` carries a ✅ in
its DO column** (courses and programmes, mostly): a course that delivers videos
and asks nothing back is the shape the market is leaving behind.

Present the possibilities as a numbered menu and **wait** — the menu, the
"you choose" shortcut and the recorded `0` live in the skill
**`learning-activities`** (item `decide`), which is the one place they are
maintained. `docs/learning.md` is the catalogue behind it: a self-check with
a pass mark, a learning game, a graded exercise — every one judged **on the
server**, never in the browser.

**Before the data model, like 1b and 1c** — an element needs its result
rows, and a check per block changes what a "block" table carries. Once, at
this point — later units inherit the decision.

**A `0` is an answer** and goes into `docs/app.md` with its reason, like
every other. **Skip entirely for an experiment.**

**On an older clone** (before 0.9.0) the `learning-activities` skill is
refused by `node run.mjs update` because its code is not there — then skip
1d and say so in one sentence, rather than improvising an unmaintained menu.

## Step 1e — How should it look?

The cheapest question of the four, asked last because it needs the answers of
the others: a coaching app and a calculator wear their pages differently, and
by now you know which one this is.

Every app on this template starts with the same look — neutral grey, indigo
accent, Geist. Ask once, as a yes/no, not a menu — the worked wording is in
[`references/menus.md`](references/menus.md).

- **Yes, or "you choose"** → run the skill **`design`**. It researches how
  comparable apps present themselves (bounded — two or three searches),
  proposes two or three named directions, writes the choice into
  `docs/design.md` and recolours the tokens. Then come back here.
- **No** → the default stays, and **write it into `docs/app.md`** under
  *Decisions worth remembering* — the verbatim entry is in
  [`references/menus.md`](references/menus.md).

Unlike 1b and 1c this is not a per-use cost and not a column — it can be done
later without a second migration. It sits here anyway because the pages built
in Step 3 follow `docs/design.md` when it exists, and restyling six pages
afterwards is the expensive version of a decision that was free before the
first one. **A "no" is an answer and is not negotiated.**

**Skip this step entirely for an experiment.** Same boundary as 1b, 1c and 1d.

## Step 2 — Extend the data model

- **Before the first content table, settle who authors the content** — when the
  developer IS the author, the content lives in code, not in tables, and gets
  no admin UI; only customer STATE gets tables. The fork is
  [`docs/content-authority.md`](../../../docs/content-authority.md) — decide it
  before `db-generate`, and record the answer in `docs/app.md` (the coach
  reads it back as the `Content authority:` line).
- **And settle, in the same breath, how that content reaches PROD** — because
  the answer is never "by itself": each environment has its own database and
  its own media store, and a deploy carries the repo and nothing else. Content
  in code travels with every deploy; content in tables is written as content
  files plus an idempotent applier (`scripts/content/appliers/`, upsert by
  slug) from the FIRST table on — **never only INSERTed into the local
  database**, which is how a finished course goes live with empty pages while
  every local gate stays green. Product media are declared in
  `content/media-manifest.json` and referenced **by path, never by media id**
  (an id exists in one database only). The transport rules and the applier
  convention are [`docs/content.md`](../../../docs/content.md); the go-live
  proof is `node run.mjs content-check --env prod`.
- New tables in `db/schema.ts` (or a separate file that is re-exported there —
  model to follow: `db/schema-digistore.ts`).
- Link purchase-dependent content to the **Member** (`users.id`, the same id
  `orders.memberId` carries) — never to a column that is not the buyer: content
  keyed on anything else is content every customer can see. What the Member may
  *do* with it is a separate question, and the entitlement API answers it.
- Then create a **migration** and apply it: `node run.mjs db-generate` → check the
  generated file in `drizzle/` → `node run.mjs db-migrate`. The migration belongs in the
  commit (see `docs/database.md`). No `db:push`.

## Step 3 — Pages & logic

**First, complete the brief:** append the page/feature list that steps 1–1d's
menus produced to `docs/product-brief.md` — the 3–5 MVP features about to be
built, one line each, BEFORE the first page is coded. That turns the brief
into a true record of what was agreed on both entry paths (with and without
`market-research`), and it is what session three reads instead of guessing.

**One question per result surface, asked while you build it:** wherever a page
hands the customer a RESULT, ask once whether it is a result to look at. Not a
menu this time — Step 1b already settled what this app shows. This is the
smaller, per-page version of it, and it exists because Step 1b decides the
product while this decides a page nobody thought about at the time.

**And one question per surface that takes work IN, asked the same way:**
wherever a page takes a submission, an answer, a photo or a plan from the
customer, ask once whether they should get back more than a confirmation that it
was saved. Not a menu — Step 1c already settled what this app does. This is the
page nobody thought about at the time.

Ask it **while that surface is built**, not later. The gateway that audits this
afterwards is `ux-gateway`, and a question deferred to it is a question asked
after the customer has already used the page.

A page that returns nothing but paragraphs is a decision, and so is a page that
answers work with nothing but "saved" — so make both visible: either put
something there, or note in `docs/app.md` why not.
[`docs/visuals.md`](../../../docs/visuals.md) is the reference for the first
(what the store can hold, how a picture gets on a page, what one generated image
costs) and [`docs/ai-providers.md`](../../../docs/ai-providers.md) → *Working
alongside your customer* for the second.

- Protected pages under `app/dashboard/…` (already secured via `proxy.ts`).
- **Purchase-dependent content asks the entitlement API**, and it needs a
  signed-in Member — the worked snippet (auth, then `hasPlan()`, then redirect)
  is in [`references/gating-examples.md`](references/gating-examples.md).

  A purchase made without an account is attached at the first sign-in, so the
  buyer never has to do anything but sign in. Never answer this from a billing
  table: a cancelled subscription still has access to the end of the paid
  period, so reading the status as "blocked" takes away time somebody paid for.
  Details and failure modes: `docs/entitlements.md`.
- **Usage-metered content charges tokens** — a different question from the one
  above, and a different call. `hasPlan()` asks *may they*, `spendTokens()` asks
  *can they afford this one* — checked FIRST with `hasSufficientBalance(...)`,
  before anything expensive runs; the worked snippet is in
  [`references/gating-examples.md`](references/gating-examples.md).

  **Check → work → charge, in that order.** Charging first bills for work that
  then fails. Doing the work with no check in front gives the result away for
  free — by the time `spendTokens` throws, the expensive part has already run.
  That second one is the mistake that actually gets made.

  **Never pass it a member id and never let one exist in its signature** — it
  charges the signed-in Member by construction, and a `memberId` out of a form
  would drain somebody else's balance. The `amount` is your price, computed in
  code: read it from the request and the customer sets it to 0. Never
  hand-write `balance = balance - n`; the ledger and the row lock are the point.
  Details: `CLAUDE.md` → **Charging tokens**.
- UI with shadcn/ui: `npx shadcn@latest add <component>`. Colors only via tokens
  from `app/globals.css`, nothing hard-coded.
- **If `docs/design.md` exists, a new page follows its composition section** —
  which components carry a result, what sits above the fold, the one signature
  element. Read it before laying out the page; do not re-decide per page what
  that file already settled (the skill `design` is where it changes).
- Messages (notice/success/warning/error) always via `Callout`
  (`components/ui/callout.tsx`, variants `info` | `success` | `warning` |
  `danger`) — no hand-picked color classes. Details in `CLAUDE.md`.
- **Every action reports back, and there are exactly three ways to do it** —
  use them, do not build a fourth: `<Callout>` for what has to stay on screen,
  `useActionToast(state)` for a server action on the same page, and
  `<FlashToast>` (`components/flash-toast.tsx`) for a result that arrives after
  a `redirect()`. That last one is the one that gets forgotten, and it is
  exactly where a purchase or a sign-up ends up. Pass `<FlashToast>` a *reference*
  in the URL and resolve the text on the receiving page — never put the message
  itself in the address. The table is in `CLAUDE.md`, under **UI**.
- Every page has to be readable in light **and** dark; the app has a toggle
  (default: system). With tokens this follows by itself.

## Step 3b — The operator/admin account: locally there is nothing to create

**Do not ask the user for an email address here, and do not create an account.**
Locally the first one makes itself: whoever signs in first at `/login` — with
any address, no password, no mail — comes into being as `owner`, and the admin
area plus the "Users" entry are in the navigation on that first page load. So
the whole step is one sentence to the user: *open http://localhost:3000/login
and sign in with whatever address you like; that account is the admin.*

The rule is `lib/users/bootstrap.ts` and it is narrow on purpose: **the very
first account, in DEV only.** Anything after it is a `member`, and outside DEV
every account is, including the first — a freshly deployed instance has an empty
user table too, and the first person to sign in there may be a customer. Handing
them user management would be an account takeover.

**Two cases still need the CLI** (`node run.mjs user-create --email <address>
--role owner --apply`), and neither is this step: **STAGING and PROD**, where
the bootstrap deliberately does not fire (that belongs to `setup-hosting` /
`go-live`), and **when YOU need `smoke`'s signed-in pass before the user has
signed in once** — then run the command and say that you did. Both cases in
full, and the sign-in details (magic link, dev login, optional passwords,
`requireOwner()` for admin pages), are in
[`references/owner-account.md`](references/owner-account.md).

## Step 4 — Write tests AND run them (mandatory)

Write tests for **every** feature and run them — not optional:
- Test **data logic/rules** with `vitest` (models: `lib/digistore/ipn.test.ts`,
  `lib/digistore/buyUrl.test.ts`). Test pure logic without a DB; DB-dependent
  cases against the local Postgres.
- Typical cases — the access-rule matrix, input validation, edges — are listed
  in [`references/gating-examples.md`](references/gating-examples.md).
- **Running them:** `npm run test` must be **green** before anything continues.
  On top of that `npm run typecheck` — `node run.mjs test` does both in one go.
  You run them yourself; nothing runs them for you after a push.

### And then: open the app yourself

**Never report "done" without having opened the pages.** Green tests and a
successful build do not rule out an "Internal Server Error" — `vitest` doesn't
render, `npm run build` runs without a database and without a real `.env`. That
is exactly where the error appears that the user then sees first.

```bash
node run.mjs start                # DB + migrations + app
node run.mjs smoke                # opens every page, reports server errors
```

5xx means: fix it before you go on — find the cause with `node run.mjs logs`.

`smoke` runs twice: anonymously, then **signed in as the owner** for every page
that sent it to `/login` — so your new protected pages are really rendered. Two
lines in its output are worth reading rather than skimming:

- `Signed in as … — the N protected page(s) again` → they were checked.
- `N protected page(s) NOT checked — <reason>` → **they were not.** Usually
  nobody has signed in yet, so there is no `owner` account for it to use
  (step 3b — `smoke` never creates one), or mail delivery is configured, which
  switches the development login off. Fix the reason or open the pages yourself;
  do not report them as working.

Dynamic pages (`[id]`) are skipped either way — open those once by hand with a
real record.

**If you have a way to open a real browser, use it here too** — `smoke` proves
every page answers, not that it looks right. If you have none, `ux-gateway`
explains how to offer the user the Playwright MCP server (a one-minute change
to their own program, not to this app); seeing the pages once now is cheaper
than meeting them broken in the `ux-gateway` pass later.

Only then tell the user that they can take a look — and write down what they
will see and at which address.

## Step 4b — Write down what you built (`docs/app.md`)

**Create `docs/app.md` now, with the first feature in it.** This is the app's own
notebook, and the reason it exists is that a session is short and a project is
not: whoever adds the fifth feature was not there for the first four. CLAUDE.md
says what the *template* is; `docs/app.md` says what *this app* is. What is not
in there gets invented a second time — a second table beside the first, a second
way of gating access, a page that does what one two folders over already did.

The shape — the product block (sells / for / archetype / output artifact /
alongside the customer), one entry per feature, and *Decisions worth
remembering* — is in [`references/app-md-template.md`](references/app-md-template.md);
copy it when creating the file, and keep it, so every entry reads the same.

Three rules about it:

- **Access is quoted, not described.** `hasPlan(memberId, "basis_monatlich")`, not
  "only for paying customers". The next session has to be able to read the gate
  off the line without opening the page.
- **A decision AGAINST is a decision.** "No pictures in the messages" belongs
  here as much as a feature does — see Step 1b and Step 1c. What is not written
  down is proposed again next session, by an agent that has no way of knowing it
  was already settled.
- **The decisions section is the valuable half.** A feature can be read out of
  the code; the reason something is *not* built cannot.

An entry also carries its **`Done when:`** line — the plain-words sentence the
user OK'd before the feature was built (CLAUDE.md → *Adding a feature*, step
0), recorded once it held. For the first feature that sentence is in the brief;
quote it, checked.

The greeting checks this by itself: a page under `app/dashboard/` that
`docs/app.md` does not mention is named at the next session start.

## Step 5 — Connect payment

Run the skill **`setup-digistore`**. It connects product ID, API key, IPN
webhook and checkout link. The IPN handler (`app/api/ipn/route.ts`) writes
purchases into `orders` automatically — don't reinvent that code.

Does the app bill **recurring (subscription) or by usage (prepaid tokens)**?
Then run the skill **`billing-modes`** afterwards.

## Step 6 — Before the launch: secure it, scale it, legal & live

One after another:
1. **`salespage`** — make the home page sell THIS product. `app/page.tsx` still
   carries the template's placeholder (three feature cards about sign-in and
   billing), and a stranger lands there first. It needs the products and prices
   from step 5, which is why it sits here and not earlier.
2. **`ux-gateway`** — look at the app the way the customer will: the first five
   minutes after a purchase, dead ends, actions that report nothing back, dark
   mode and the phone. Early, because what it finds changes the interface.
3. **`security-gateway`** — scan the app for security holes and fix them.
4. **`performance-gateway`** — make sure ~100 parallel users run smoothly.
5. **`compliance-check`** — legal pages (imprint/privacy/terms/withdrawal), GDPR.
6. **`go-live`** — put the app online and verify it live.
7. **`go-to-market`** — positioning, channels, launch plan and finished content
   (landing page copy, emails, video scripts).

## The golden rules (don't work against them)

- **Sign-in stays mandatory** for all app pages (except home, sign-in, opt-in,
  IPN).
- **Never switch off the IPN signature verification** (`lib/digistore/ipn.ts`).
- **No secrets/API keys in the code.** Always `.env` (Digistore24 key via
  `node run.mjs ds24-connect`); no input fields for keys in the app.
- **For money, customer data, new external systems:** read the skill
  `guardrails` first and stop when in doubt.
