---
name: coach
description: The guide through the project — works out where this app stands and which skill comes next, and routes a concrete problem to the place that solves it. Use this when the user asks "what is the next step?", "how do I solve XY?", "where am I?", "which skill do I need?", "I am stuck", or when they describe a symptom (an error page, a purchase that never arrived, the assistant answering "I do not know") without naming a skill.
---
<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# The coach — which step, which skill, which command

This app is built in steps, and each one has a skill behind it. This skill is
the one that **finds the right one** — it does not build anything itself. It
answers two questions, and nothing else:

- **"What is the next step?"** → work out where the project stands, name **one**
  step, start it.
- **"How do I solve XY?"** → take the symptom to the place that fixes it.

The path itself (idea → build → payment → security → scaling → legal → live →
marketing, plus the optional ones) is written down in `CLAUDE.md` and `README.md`
and is not repeated here — a list kept in four places is a list that is wrong in
three of them. What lives here is what exists nowhere else: **how to tell where
the project actually is**, and **which symptom belongs to which skill**.

## 1. Look first — do not ask what you can read

The user does not always know where they are; the project does. Almost every
step leaves a trace on disk, so read it and then say what you found. "Where did
you get to?" is a question the coach should rarely have to ask.

| Question | Look at | Answer |
|---|---|---|
| Does the machine work? | the session-start line `[Setup: ok]` / `[Setup: blocked — …]`, otherwise `node run.mjs doctor` | blocked → **`setup-machine`**, before anything else |
| Is there an idea? | `docs/product-brief.md` | missing and the user cannot say in two sentences what the app does → **`market-research`** |
| Was it ever decided what the customer HOLDS? | an `Output artifact:` line in `docs/product-brief.md`; failing that, the decisions section of `docs/app.md` | neither says anything, and the app's pages hand out text → **`visuals`** (check `plan`). A brief that says "generates the copy" where the customer wanted a finished page is the commonest reason an app feels thin |
| Was it ever decided what the app DOES alongside them? | an `Alongside the customer:` line in `docs/product-brief.md`; failing that, the decisions section of `docs/app.md` | neither says anything, and the app's surfaces only store what the customer typed → **`build-app`** (step 1c) while the app is being built, or **`ai-companion`** (item `decide`) for one that already exists. **A recorded "no" is an answer** — say so and move on, do not ask again. That distinction is the whole point of the row: a question not yet asked and one already declined look identical from the outside, and re-proposing a thing the vendor turned down in session one is how a coach becomes something people skip |
| Is there an app of their own? | folders under `app/dashboard/` beyond `account`, `admin`, `billing`, `chat`; own tables in `db/schema.ts` | nothing of their own → **`build-app`** |
| Was the first session ever designed? | an `Activation:` line in `docs/app.md`; the checklist steps in `app/dashboard/page.tsx` | no line, and the steps are still the two shipped blueprint ones on an app that does something of its own → **`user-onboarding`** (item `decide`). The app's only advice to a new customer is "buy something", and nobody has decided what it should say instead. **A recorded "no" is an answer** — say so and move on |
| Was a look ever chosen? | `docs/design.md`; failing that, a *No custom identity* entry in `docs/app.md` | neither says anything and the app has its own pages → **`design`** — the app is running on the shipped indigo/neutral default without anybody having decided that. **A recorded "no" is an answer** — say so and move on |
| Does the home page sell the product? | `app/page.tsx` — does it still carry the shipped placeholder (the three `home.features.*` cards, key/cart/sparkles icons); failing that, a salespage entry in `docs/app.md` | still the placeholder — or its structure with swapped texts — on an app that has real products → **`salespage`**: the first page a stranger sees sells the template, not the product. **A recorded "no" is an answer** — say so and move on |
| What has been built so far? | `docs/app.md` — the app's own notebook, one entry per feature | pages under `app/dashboard/` that it does not mention → the last session did not write its entry; add it before building anything new (**`build-app`** step 4b holds the shape) |
| Is payment connected? | `DIGISTORE_API_KEY` in `.env`; ids under `productIdByLanguage` on the products in `config/digistore-products.json`; `DIGISTORE_IPN_PASSPHRASE` + `DIGISTORE_IPN_DOMAIN_ID` | key but no ids → the sync never ran; no passphrase → no IPN, so purchases arrive nowhere → **`setup-digistore`**. A product id for only *some* of the app's languages → the missing ones get an order form in the wrong language → re-run `node run.mjs ds24-sync` and read its warnings |
| What does it sell? | `"billingMode"` in `config/digistore-products.json` | still `"both"` on an app that sells one of them → **`build-app`** (step 1) sets it; the models themselves are **`billing-modes`** |
| Is the assistant on? | `"enabled"` in `config/ai-chat.json`, then `node run.mjs ai-check` | on but with a thin `content/knowledge/` → **`ai-chat-knowledge`** |
| Is there an AI interface? | `"enabled"` in `config/mcp.json` (ships **off**) | wanted → **`mcp-server`** |
| Has anybody looked at it as a customer? | the newest `docs/reports/ux-*.md`, and `node run.mjs ux-check` | none once there are pages and a checkout → **`ux-gateway`**. Its findings change the interface, so it belongs before the security pass, not after it |
| Has it been checked for security? | the newest `docs/reports/security-*.md` | none → **`security-gateway`**; one with an open CRITICAL or HIGH → fix those before anything else; one older than the last big change → run it again |
| Has it been measured under load? | the newest `docs/reports/performance-*.md` | none before a launch → **`performance-gateway`** |
| Are the legal pages there? | routes `app/impressum`, `app/datenschutz` (`app/agb`, `app/widerruf` depending on the seller role) | missing before selling → **`compliance-check`** |
| Is it live? | `APP_URL` and `APP_ENV` in `.env` | still `localhost` → **`go-live`**, which starts with **`setup-hosting`** |
| Is there a host at all? | `node run.mjs doctor --deploy` — is a hosting CLI installed and logged in? | nothing there and the app is meant to go online → **`setup-hosting`** |

**Three of the steps do leave a trace, and one does not.** `ux-gateway`,
`security-gateway` and `performance-gateway` each write a dated report into
`docs/reports/` — `ux-2026-07-27.md`, `security-2026-07-26.md`,
`performance-2026-07-26.md`. Read the newest one: it says which checks ran, what
was found and what is still open. A report older than the last big change is
worth as much as no report, so compare its date against
`git log -1 --format=%cd`; an open CRITICAL or HIGH in it is the next step,
whatever else the table says.

`go-to-market` still writes nothing that proves it ran. Do not infer it — ask,
in one sentence. And when there is no report at all, that is the answer: the
gateway has not run. A second security scan on an app that has not changed costs
a few minutes; a skipped one costs a live app with a hole in it.

## 2. "What is the next step?"

Name **one**. Not the remaining list, not a plan for the afternoon — the single
thing that comes next, in one or two sentences, plus what it will do. Then offer
to start it right away, and start it if the user says yes.

Two things this gets wrong if you let it:

- **The next step is not always the next row in the table.** Somebody who has
  just built three pages usually wants a fourth, not `setup-digistore`. Read what
  they have been doing; the path is the default, not a rail.
- **Optional stays optional.** `billing-modes`, `ai-chat-knowledge`,
  `ai-providers` and `mcp-server` are offered when there is a reason for them,
  never because they have not been done yet.

## 3. "How do I solve XY?"

**Read the error before you route.** This table maps symptoms, and a symptom is
a guess; the log is not. When something is broken in the app, `node run.mjs logs`
and `node run.mjs errors` come first, and the cause they name beats anything
below.

| The symptom | Where it belongs |
|---|---|
| "docker: not found", "npm not found", the database does not answer, nothing starts | a setup problem, not a bug → **`setup-machine`** |
| "Internal Server Error", a blank page, a page that will not load | `node run.mjs logs` for the stack trace, then fix it. `node run.mjs smoke` afterwards |
| The page loads, but shows a raw timestamp, a missing text, `2026-07-25 11:29:17.5` | `node run.mjs errors` — a 200 is not proof it rendered. `CLAUDE.md` → **Dates and raw SQL** |
| A test purchase never reaches the app locally | the IPN needs a publicly reachable address → **`setup-digistore`**, `node run.mjs ds24-tunnel`, `node run.mjs status` |
| "Somebody paid and the app knows nothing about it" | ask Digistore24 first: `node run.mjs ds24-purchase --order …`. Unknown there → no purchase; known there and missing under `/dashboard/admin/purchases` → no IPN arrived (dead tunnel URL, a `domain_id` another project overwrote, a `product_ids` list without this product) → **`setup-digistore`** |
| A customer paid and has no access | read the **grant**, not the order — `docs/entitlements.md`. Usually a wrong `hasPlan()` key, not a broken payment |
| A balance stuck at 0, an empty "next payment" card | `"billingMode"` in `config/digistore-products.json` — a display setting, see `lib/billing-mode.ts` |
| Subscriptions, prepaid tokens, auto top-up, cancellation, invoices | **`billing-modes`** |
| The assistant answers "I do not know" | her handbook, not her switch → **`ai-chat-knowledge`**, then `node run.mjs kb-check` |
| Which AI company, what does a call cost, a key is missing | **`ai-providers`**, `node run.mjs ai-check` |
| "Claude should be able to use my app" | **`mcp-server`**, `node run.mjs mcp-check` |
| "My customers do not find their way around", "is this understandable?" | **`ux-gateway`**, `node run.mjs ux-check` |
| **"Nobody uses it after they buy"** — the one phrase with two answers | Ask which is missing: has anybody *looked* at the first five minutes → **`ux-gateway`** (check `first-run`) audits them. Was the first session ever *designed* — an activation event, steps that mean this app → **`user-onboarding`** (item `decide`) builds it. The section-1 row above settles it from disk: blueprint steps still shipped + no `Activation:` line in `docs/app.md` → nothing to audit yet, design first |
| "My customers sign up and never come back", "nobody finishes the setup", "how do I explain my app to new users", "I want a welcome tour / first steps" | **`user-onboarding`** — the patterns are `docs/onboarding.md`; a tour overlay is deliberately not one of them (§6 there says what replaces it) |
| **"This looks unfinished"** — the one phrase with three answers | Ask which: pages that look hand-built, colours that clash, actions that say nothing → **`ux-gateway`** (check `kit`). Pages that are correct and hand the customer nothing but paragraphs → **`visuals`** (check `plan`). Pages that are correct, are not a wall of text, and answer the customer's own work with "saved ✓" → **`ai-companion`** (item `decide`). One question is still faster than the wrong ten minutes |
| "It looks generic", "it looks like every other app", "give it its own look", "change the colours", "change the font" | **`design`** — it proposes named directions, writes the choice into `docs/design.md` and recolours the tokens. Pages that look *hand-built or broken* are **`ux-gateway`** (check `kit`) instead — one question settles which |
| "My app is only text", "I want pictures in it", "can it make images?", "customers should be able to upload a photo" | **`visuals`** — the catalogue is `docs/visuals.md`, and `node run.mjs media-check` says whether there is anywhere to put a file |
| "My customers just get a list", "it does not do anything for them", "could it help my users while they work", "it only saves what they type" | **`ai-companion`** — the catalogue is `docs/ai-in-product.md`, and `node run.mjs ai-check` says whether this app can call a model at all |
| "Where do I put the PDF my buyers get?" | **`visuals`** (check `sell`) — a file with `visibility: "entitled"` and a Product Key; `hasPlan()` does the rest |
| "The page is unreadable in dark mode", a colour that vanishes, text nobody can make out | `node run.mjs ux-check` measures every token pair in both modes — then **`ux-gateway`** (check `kit`) |
| Slow, timing out, will it hold under load | **`performance-gateway`** |
| Is this safe? Is this route protected? Is there a secret in the code? | **`security-gateway`** |
| Imprint, privacy policy, GDPR, "what does the app store about people?" | **`compliance-check`**, `node run.mjs legal-check`; the inventory it reads from is `docs/data-protection.md` |
| "Do I need a cookie banner?" | **`compliance-check`** (check `consent`). The shipped answer is **no** — this app sets no tracking cookie, and a banner without tracking is itself a defect under § 25 TDDDG |
| "Does the AI Act apply to me?", "must my chatbot say it is a bot?", a letter about KI-Verordnung | **`compliance-check`** (check `ai`). Art. 50 has applied since 2 August 2026; the map is `docs/compliance.md` |
| "Can my customers delete their account?", a subject access request, somebody wants their data | **`compliance-check`** (check `rights`). Both already exist: `/dashboard/account` for the member, `node run.mjs data-export --email …` for the operator |
| A warning letter (Abmahnung), a data protection authority writes, "am I allowed to sell this yet?" | **`compliance-check`** — and read its STOP section: several of these are for a lawyer, not for an agent |
| Which host, what does hosting cost, an account, a CLI, an API token | **`setup-hosting`**, `docs/DEPLOY.md` |
| The whole launch: deploy, live products, IPN on the real domain, test purchase | **`go-live`** — it starts by handing the hosting to `setup-hosting` |
| It runs locally but not at the host: `✗ Startup aborted`, "the environment is not ready" | almost always the missing mail transport — in STAGING/PROD it is mandatory (`lib/env-guard.ts`). `node run.mjs mail-setup`, then the values into the host's secrets |
| A page at the host answers 500 where it worked locally, tables are missing | the migration did not run before the new version — the pre-deploy hook, `docs/DEPLOY.md` → **Migrations** |
| "My homepage is weak", "the start page still shows the template", "the landing page looks empty", "make the home page sell" | **`salespage`** — the reference is `docs/salespage.md`. Pages that look hand-built or broken are **`ux-gateway`** (check `kit`) instead |
| **"Nobody is buying"** — the one phrase with two answers | Ask which is missing: nobody *lands* on the page (no channel, no reach, what should it cost) → **`go-to-market`**. People land and leave — the page does not argue, show or offer anything → **`salespage`**. `/` still being the shipped placeholder settles it from disk |
| What should it cost, which channel, launch plan | **`go-to-market`** |
| Anything touching money, secrets, customer data or a new external system | **`guardrails`** first, then whatever else |
| "my people never find their way around the course" — the one phrase with two answers | Ask which: lost in the COURSE's order → the shape may not match how it is sold — `docs/courses.md` (the chooser, including its tie-break). Lost in the APP → **`ux-gateway`**. On a LIVE app, changing shape is a data migration, not a refactor — plan it before touching tables |
| "I cannot see who is where in the course", "who has actually finished?" | progress is derived, never stored twice, and each shape derives it differently — `docs/courses.md`: shape 1 from `unit_completions`, shape 2 from the grant date, shape 3 from the submissions. For judged self-checks (never the submitted text) → skill **`learning-activities`** (needs template 0.9.0) |
| "my people never finish the course", "they watch the videos and drift away" | the course asks nothing of them — skill **`learning-activities`** (item `decide`, needs template 0.9.0): a check or a game per block, judged on the server. A recorded "no" in `docs/app.md` is an answer — say so and stop |
| "my lessons have no videos yet", "how do I create the course content?", "can you produce the videos?", "I need an explainer / talking-head video" | media that do not exist yet are production work → **`content-production`** (scripts in one format, tools recommended and set up on request — `docs/content-production.md`). Material that already EXISTS as files or recordings is **`knowledge-intake`** instead — one question settles which |

## 4. Most work is not a skill

A new page, a column, a text, a colour, a bug — that is ordinary work, and the
answer is to do it, not to route it somewhere. The skills cover the **stations**
of the project; everything between them is just building, and `CLAUDE.md` is the
guide for that.

So when nothing here fits: say so in one sentence and get on with the work.
Sending somebody to `build-app` because they asked for a button is worse than
useless — it costs them a conversation and gives them nothing.

## The rules

1. **One next step, never a catalogue.** Somebody who asks what to do next is
   already unsure; a list of fourteen options is not an answer to that.
2. **Look before you ask.** The table in section 1 answers most of it from disk.
   Ask only about the three things that leave no trace.
3. **Hand over — do not half-do it.** The coach ends by *starting* the skill it
   named. Explaining what `setup-digistore` would do and then stopping leaves the
   user exactly where they were.
4. **Never invent a step.** If it is not a skill in `.claude/skills/` and not a
   command in `run.mjs`, it is not on this path.
5. **Skipping is the user's decision.** `security-gateway` and `compliance-check`
   are the two that get skipped. Name what it costs — once, in a sentence — and
   then do as they ask.
