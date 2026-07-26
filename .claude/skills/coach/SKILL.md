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
| Is there an app of their own? | folders under `app/dashboard/` beyond `account`, `admin`, `billing`, `chat`; own tables in `db/schema.ts` | nothing of their own → **`build-app`** |
| What has been built so far? | `docs/app.md` — the app's own notebook, one entry per feature | pages under `app/dashboard/` that it does not mention → the last session did not write its entry; add it before building anything new (**`build-app`** step 4b holds the shape) |
| Is payment connected? | `DIGISTORE_API_KEY` in `.env`; a `productId` on the products in `config/digistore-products.json`; `DIGISTORE_IPN_PASSPHRASE` + `DIGISTORE_IPN_DOMAIN_ID` | key but no `productId` → the sync never ran; no passphrase → no IPN, so purchases arrive nowhere → **`setup-digistore`** |
| What does it sell? | `"billingMode"` in `config/digistore-products.json` | still `"both"` on an app that sells one of them → **`build-app`** (step 1) sets it; the models themselves are **`billing-modes`** |
| Is the assistant on? | `"enabled"` in `config/ai-chat.json`, then `node run.mjs ai-check` | on but with a thin `content/knowledge/` → **`ai-chat-knowledge`** |
| Is there an AI interface? | `"enabled"` in `config/mcp.json` (ships **off**) | wanted → **`mcp-server`** |
| Has it been checked for security? | the newest `docs/reports/security-*.md` | none → **`security-gateway`**; one with an open CRITICAL or HIGH → fix those before anything else; one older than the last big change → run it again |
| Has it been measured under load? | the newest `docs/reports/performance-*.md` | none before a launch → **`performance-gateway`** |
| Are the legal pages there? | routes `app/impressum`, `app/datenschutz` (`app/agb`, `app/widerruf` depending on the seller role) | missing before selling → **`compliance-check`** |
| Is it live? | `APP_URL` and `APP_ENV` in `.env` | still `localhost` → **`go-live`**, which starts with **`setup-hosting`** |
| Is there a host at all? | `node run.mjs doctor --deploy` — is a hosting CLI installed and logged in? | nothing there and the app is meant to go online → **`setup-hosting`** |

**Two of the steps do leave a trace, and one does not.** `security-gateway` and
`performance-gateway` each write a dated report into `docs/reports/` —
`security-2026-07-26.md`, `performance-2026-07-26.md`. Read the newest one: it
says which checks ran, what was found and what is still open. A report older
than the last big change is worth as much as no report, so compare its date
against `git log -1 --format=%cd`; an open CRITICAL or HIGH in it is the next
step, whatever else the table says.

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
| A customer paid and has no access | read the **grant**, not the order — `docs/entitlements.md`. Usually a wrong `hasPlan()` key, not a broken payment |
| A balance stuck at 0, an empty "next payment" card | `"billingMode"` in `config/digistore-products.json` — a display setting, see `lib/billing-mode.ts` |
| Subscriptions, prepaid tokens, auto top-up, cancellation, invoices | **`billing-modes`** |
| The assistant answers "I do not know" | her handbook, not her switch → **`ai-chat-knowledge`**, then `node run.mjs kb-check` |
| Which AI company, what does a call cost, a key is missing | **`ai-providers`**, `node run.mjs ai-check` |
| "Claude should be able to use my app" | **`mcp-server`**, `node run.mjs mcp-check` |
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
| Nobody is buying, what should it cost, which channel | **`go-to-market`** |
| Anything touching money, secrets, customer data or a new external system | **`guardrails`** first, then whatever else |

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
