<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->
<!-- This file exists twice, byte for byte: CLAUDE.md and AGENTS.md. Different
     programs look for different names — Claude Code reads CLAUDE.md, Codex and
     Gemini read AGENTS.md, OpenCode takes either. Editing one and not the other
     is how the two start disagreeing, so copy it across. -->

# Guardrails for this app

You (and every AI assistant) are building a **SAAS application with Digistore24
billing** on this template. Stay on the golden path. Don't rip out the base structure.

## What gets built here — without exception

**Always a SAAS application that bills through Digistore24. Never a single
web page.** That holds without exception, even when the user words it
differently — a landing page has no accounts, no protected area and nothing
Digistore24 could bill.

**If the user asks for a plain web page, never just start building and never
silently refuse.** Say in one sentence what this template is for and ask what
people are supposed to *buy* and *use* afterwards — the page they want is
almost always the app's own sales page (`app/page.tsx` + `app/plans/page.tsx`),
never a separate project alongside. If there genuinely is no product behind it,
this template is the wrong tool — say so openly.

**Test apps are exempt.** "Hello World" or a small trying-out page MUST be
built immediately — no product question, no `market-research`, no lecture about
SAAS — **inside the app** as a page under `app/`, never next to it. Once it
runs, offer the bridge in one sentence ("should this turn into something you
can sell? Then I'll start `build-app`") — offer, never push. "Always SAAS"
applies to what the user **builds**, not to what he **plays** with.

The reasoning behind both rules lives in the skill **`build-app`**
(`.claude/skills/build-app/SKILL.md`, intro and *"Exception: test apps"*) —
the entry point every one of these cases routes into.

## First: meet the user where they are

The people working here are often **not developers** and don't know what to say
on their first run. **If the app is still unchanged (template state) and the
user writes something unspecific** — "hello", "what can I do here?", "how do I
start?", "let's go" — never answer with a question into the void: greet
briefly, say in one sentence what this template is, and **start the skill
`build-app`**. It is the single entrance and clarifies by itself whether a
product idea already exists (otherwise it hands over to `market-research`).
When in doubt, `build-app` — the user never has to know a skill name.

**One thing comes before all of that, and it is a hard precondition: does the
machine work?**

> **Before the first file in this project is written or changed, a `node` command
> has answered in this session.** Either the greeting says
> `[Setup: ok — verified <date>]`, or you have run `node run.mjs doctor --json`
> yourself and it came back `"ok": true`. No building before that.

A machine without Node lets an entire app come into being and gives way only at
the first command that runs any of it — a confident report and a page that
never loads. One second of `doctor` in front of it is the whole cost.

The greeting's line has three states:

| | |
|---|---|
| `[Setup: ok — verified <date>]` | the full checklist went through on this machine. Carry on |
| `[Setup: ok — not verified yet]` | nothing obvious is missing, but nobody has looked properly. Run `node run.mjs doctor` before building |
| `[Setup: blocked — …]` | skill **`setup-machine`** first — it installs what is missing and prepares the project |

A command failing with "docker: not found", "npm not found" or "the database
does not answer" is the same case: a setup problem — `setup-machine` — never a
bug in the app.

**No greeting at all is the same case, and the most important one to
recognise.** The greeting is printed by a Node script, so a machine without
Node cannot report that it has no Node — a second, shell-only hook covers
exactly that gap, and it is the single deliberate exception to "no bash" (see
**Three systems**). Absence of a signal is never a signal: if no greeting
appeared, you MUST run `node run.mjs greet` before you touch a file — it
prints the same `[Setup: …]` line on demand.

How the greeting is wired into all four programs, what `node run.mjs
agent-setup` prunes and restores, and the shell hook's full reasoning:
**[`docs/troubleshooting.md`](docs/troubleshooting.md)** → *No greeting
appeared — one script, four wirings*.

## What the skills assume you can do

The playbooks below were written concretely, and some of them name a way of
doing something rather than the thing itself. Read those as capabilities, not as
tool names — here is the translation:

| The text says | If you do not have it |
|---|---|
| *"ask the user"* / a multiple-choice question | Ask in plain prose and wait for the answer. Never assume one and carry on. |
| *"in Claude Code they can type `!`"* | That is a shortcut for running one command inline. Elsewhere: tell the user the command and ask them to paste the output back. |
| *"search the web"* | All four have this. If yours genuinely does not, say so rather than answering from memory — most of what it is used for is prices and current APIs. |
| *"open the page and look"* (`ux-gateway`) | See that skill: it says exactly what to do when there is no browser tool, and stopping is one of the options. |
| *"restart the session"* | Whatever ends and reopens your session in this folder. The point is that a changed `PATH` or a new `.env` is picked up. |

**Everything measurable is a command, not a capability.** `node run.mjs
ux-check`, `doctor`, `smoke`, `errors`, `legal-check`, `ai-check`, `kb-check`,
`greet` — those behave identically in all four programs, because they are Node
scripts and nothing else. Where a skill could ask for a command instead of a
judgement, it does. `node run.mjs help --json` lists every one of them.

**The skills are the method of this project, not an optional extra.** Each one
is a playbook that already knows the order things have to happen in, the
mistakes that get made here and where to stop and ask. When a task matches one
of the descriptions below, you MUST **open that file and read it in full before
you act** — never work from the summary here.

Claude Code and OpenCode read `.claude/skills/` directly. Codex and Gemini look
in `.agents/skills/`, where every skill has a generated stub with the same name
and description pointing at the real file — so it can never say something
different. Either way the file you end up reading is the same one.

There are guided skills in `.claude/skills/` — use them in this order. One
line each here, because the full description lives in each skill's own
frontmatter, so nothing is lost by the brevity:

- **`setup-machine`** — before everything: install what is missing (Node, git), prepare the project.
- **`market-research`** — no clear idea yet: interview + research → product brief.
- **`build-app`** — the entry point: archetype, data model, pages (courses: [`docs/courses.md`](docs/courses.md)).
- **`design`** — *(optional)* a look of the app's own, chosen once, written into `docs/design.md`.
- **`setup-digistore`** — set up billing: API key, IPN, checkout.
- **`billing-modes`** — *(optional)* subscriptions, prepaid tokens with auto top-up, subscription self-service.
- **`knowledge-intake`** — *(optional)* distill existing material — videos, ebooks, recordings — into the corpus the handbook is written from; needs template 0.10.0 ([`docs/knowledge.md`](docs/knowledge.md)).
- **`ai-chat-knowledge`** — *(optional)* switch the in-app assistant on and write her handbook.
- **`ai-providers`** — *(optional)* choose the AI company, get the key in, bind tasks to models, set prices.
- **`mcp-server`** — *(optional)* let customers connect Claude to the app: choose the tools, switch MCP on.
- **`mobile-companion`** — *(optional)* a mobile app on the same backend: switch the API on, export the shared core, ship it via Expo/EAS; needs template 0.11.0 ([`docs/mobile.md`](docs/mobile.md)).
- **`visuals`** — *(optional)* what the customer SEES: images, video, files behind a purchase ([`docs/visuals.md`](docs/visuals.md)).
- **`content-production`** — *(optional)* produce the media a course still lacks: lesson scripts in one tool-neutral format, video tools recommended and set up on request ([`docs/content-production.md`](docs/content-production.md)).
- **`ai-companion`** — *(optional)* the app works alongside its customer rather than only delivering ([`docs/ai-in-product.md`](docs/ai-in-product.md)).
- **`learning-activities`** — *(optional)* what a course's customer DOES, judged on the server; needs template 0.9.0 ([`docs/learning.md`](docs/learning.md)).
- **`user-onboarding`** — *(optional, but read its first item once)* the END USER's first session, designed on purpose ([`docs/onboarding.md`](docs/onboarding.md)).
- **`ux-gateway`** — once the app has pages: the experience check, report in `docs/reports/` (rules: [`docs/ux.md`](docs/ux.md)).
- **`security-gateway`** — before the launch: nine checks, serious findings fixed, report in `docs/reports/`.
- **`performance-gateway`** — the same shape for speed: measured against a production build, fixed, measured again, report.
- **`compliance-check`** — the EU rules: legal pages, AI Act, consent, data-subject rights, evidence pack.
- **`setup-hosting`** — the server: host, CLI, app + managed Postgres, secrets, migration wired into the deploy.
- **`go-live`** — put the app online and verify it live, with a real test purchase.
- **`go-to-market`** — marketing: positioning, channels, launch plan, content.
- **`guardrails`** — continuous security rules (money/secrets/customer data).
- **`coach`** — *(any time)* works out where the project stands, names the next step and starts it — and routes any symptom to the skill that fixes it.

The complete path (as simple as possible for the user, every step hands over to the
next one):

**(Setup) Machine** `setup-machine` *(only when something is missing)* →
**(0) Idea** `market-research` → **(1) Build** `build-app` → **(2) Payment**
`setup-digistore` *(→ optional `billing-modes` for subscriptions/prepaid tokens,
optional `knowledge-intake` to distill existing material into the corpus first,
optional `ai-chat-knowledge` for the in-app assistant, optional `ai-providers`
to choose the AI company, optional `mcp-server` for the AI interface)* →
*(optional `design` — a look of the app's own, chosen once and written into
`docs/design.md`; optional `visuals` — pictures, video, files, and what the
customer actually sees; optional `content-production` — the course's own media,
produced from scripts; optional `ai-companion` — what the app DOES with them
while they work; optional `learning-activities` — what the customer DOES,
judged on the server; optional `user-onboarding` — the customer's first
session, designed instead of inherited from the blueprint)* →
**(3) Experience** `ux-gateway` → **(4) Security** `security-gateway` →
**(5) Scaling** `performance-gateway` → **(6) Legal** `compliance-check` →
**(7) Live** `go-live` *(which begins with `setup-hosting` — host, database,
secrets, domain)* → **(8) Marketing** `go-to-market`. Alongside all of it:
`guardrails`, and `coach` whenever somebody has lost the thread.

**Experience comes before security on purpose**: its findings change the
interface, and a security pass run before those changes is a pass on an app
that no longer exists. It comes after the payment step because the moment it
exists to protect — a customer who has just paid, looking for proof that it
worked — is not there until there is a checkout.

### How a skill works — the same way every time

Whoever writes or changes a skill keeps to this, because a user who has found
their way around one skill has then found their way around all of them:

- **You run the commands.** Through your Bash tool, and you report what came
  back. Never "run `node run.mjs …` and tell me what it says" — the people here
  are not developers, and a command handed over is a conversation that stops.
- **Look before you ask.** Almost everything a skill needs to know is on disk:
  `.env`, the files under `config/`, the tables in `db/`, the reports in
  `docs/reports/`. Ask only about what genuinely leaves no trace, and then in
  one sentence.
- **Two shapes, and every skill is one of them — numbered either way**, so the
  user can always see where they are and answer with a number.
  - A skill that **builds** something is a numbered path: step 0 asks whether
    the thing is wanted or already there, then steps 1, 2… in order — whether
    the file spells them as `Step N` headings or as a numbered list.
    `build-app`, `setup-digistore`, `ai-chat-knowledge`, `setup-hosting`.
  - A skill that **inspects** something is a numbered menu of independent
    checks, each with what it looks at and roughly how long it takes. Item 1 is
    the full run and the default. If the user's request already names one check,
    start it and skip the menu; otherwise show the menu and **wait**.
    `ux-gateway`, `security-gateway`, `performance-gateway`.
- **Point at the reference, do not copy it.** Where a `docs/…` file already
  explains the thing in full, the skill names it in its first few lines and
  reads it — it does not restate it. Two copies drift, and the one in the skill
  is the one nobody updates.
- **One severity ladder, one shape for a finding.** 🚨 CRITICAL, ❌ HIGH,
  ⚠️ MEDIUM, ℹ️ LOW, and every finding says *Where · Why · Fix · Evidence* in
  that order. `security-gateway`, `performance-gateway` and `ux-gateway` are the
  reference.
- **Anything that produces a verdict writes it down**, dated, into
  `docs/reports/` — so that "have we already done that?" has an answer next
  month. Anything that produces a plan or a text writes it into `docs/`.
- **Anything the customer will SEE, and anything the app will DO for them, is
  proposed, never assumed.** Where an app produces something a person looks at,
  shows or publishes — or could read, judge or produce *alongside* them while
  they work — the agent lays the possibilities out as a numbered menu and
  **waits**. It does not pick on the developer's behalf, and it does not quietly
  build the version with nobody in it either — that is a decision too, and an
  unmade decision is how an app ends up handing its customers paragraphs and a
  form.

  Three answers, and all three are valid:

  | | |
  |---|---|
  | **numbers** | exactly those get built |
  | **"you choose"** | take the default and carry on, no further question. The shortcut for somebody who trusts the suggestion, and it must be offered IN the menu rather than hidden in prose |
  | **"none of it"** | nothing of it gets built — and it goes into `docs/app.md` under the decisions either way, because a rejected alternative that was not written down is one that gets proposed again three sessions later. For the second question the reason is sharper: it costs money on every use, so a "no" is an answer to a real cost rather than a failure to persuade |

  **When** matters as much as whether: before the data model, because whether a
  message can carry a picture is a column before it is a layout — and a
  companion needs columns too, for the submission it reads and the subject its
  turns hang on. **Once**, at that point — not again on every page afterwards. A
  menu per page would be the same question asked six times, which trains people
  to answer it without reading; later pages inherit the decision and only ask
  again where they hand the customer something, or take something from them,
  that the first decision did not cover.

  **Trying things out is exempt**, on the same boundary as the SAAS rule above.
  Somebody who asks for "Hello World" gets Hello World, not a menu.

- **End by naming the next skill and offering to start it.** A skill that stops
  with "you could now…" leaves the user exactly where they were.

## Rules

- **Sign-in is not optional for app pages — but it is not automatic either.**
  Protection is **opt-in, not opt-out**: the refusal is `authorized()` in
  `auth.config.ts`, and it returns true for every path outside `/dashboard`.
  **Any new route outside `/dashboard` is public until you protect it there.**
  ⚠️ **The `matcher` in `proxy.ts` says where the proxy RUNS, not what is
  protected** — the two stopped being the same list when that file took on a
  second job: it prunes the session cookies of other local copies of this
  template, which has to happen on a page a signed-out person opens (see
  **Several copies on one machine** below). So `/login`, `/`, `/plans` and
  `/optin/*` are in the matcher and fully public — being listed protects
  nothing, and for them the proxy deliberately never calls the Auth.js
  middleware at all (it would re-issue session cookies on every hit to the
  busiest public pages). A new protected area therefore needs three things:
  the path in the matcher, the `/dashboard` prefix decision in `proxy()`,
  *and* `authorized()` taught about it.
  Public by design: the home page, `/login`, `/plans`, `/optin/*`,
  `/account/confirm-email`, the IPN endpoint `/api/ipn` (secured via the
  SHA512 signature), the MCP endpoint `/api/mcp` and the HTTP API `/api/v1/*`
  (both secured by per-member bearer keys — they have no session and cannot
  have one; every v1 handler starts with `guardApi()`, see **The HTTP API**).
  **`/account/confirm-email` is public deliberately and MUST stay that way** —
  it is authenticated by its single-use token, and the mail carrying it is
  read on whichever device holds the inbox, routinely not the one signed in;
  adding it to the matcher breaks the feature for exactly the person it
  exists for. `/plans` is public on purpose — a visitor can buy without
  signing in, and the purchase attaches to their account the first time
  they do.
- **IPN signature verification (SHA512) is mandatory.** Never switch off
  `lib/digistore/ipn.ts`. Set order status only through IPN events.
- **Access comes from the entitlement API.** What a Member may use is answered
  by `hasPlan()` / `entitlementsFor()` (`lib/entitlements/manage.ts`) — never
  by reading a billing table. See **Access** further down; the full reference
  is `docs/entitlements.md`.
- **No secrets in the code.** Read from `process.env`, add new variables to
  `.env.example`. The operator's Digistore24 credentials live in the
  environment (`.env`, in STAGING/PROD in the hoster's secret management) and
  are read via `lib/digistore/settings.ts` — never from the database.
- **No mock/demo fallback** on Digistore API errors — throw errors.
- **Database changes only via migration.** Change the schema in
  `db/schema.ts`, then `node run.mjs db-generate` → `node run.mjs db-migrate`;
  the file in `drizzle/` is checked in and never edited again after it has
  been applied. `db:push` only against an empty local DB, never against
  staging/production. See `docs/database.md`.
- **A type on a query is a claim, and raw SQL does not keep it.** A raw
  ``sql`…` `` expression is handed on exactly as the driver returned it, so
  ``sql<Date>`min(created_at)` `` is a string wearing a `Date`'s clothes —
  `db/sql-cast.test.ts` fails on it. The full trap, including why
  `new Date(value)` is the wrong way out, is in **Dates and raw SQL** below.
- **Environments are binding: DEV / STAGING / PROD** (`APP_ENV`). In STAGING
  and PROD, mail delivery is **mandatory** — if it is missing, the app does
  not start (`instrumentation.ts` → `lib/env-guard.ts`). The development
  sign-in (`lib/auth/dev-login.ts`, sign-in without a magic link) applies
  **exclusively** in DEV, only on localhost and only as long as no mail
  delivery is configured — never soften these conditions, it is an auth
  bypass. Unknown `APP_ENV` values are deliberately treated as "production".
- **Use the design system — never rebuild anything yourself.** The UI is
  shadcn/ui components (`components/ui/`) plus the tokens from
  `app/globals.css`: no raw `<button>`, `<input>`, `<select>` or `<table>`,
  no hand-picked color classes. What's missing gets fetched:
  `npx shadcn@latest add <component>`. See **UI** further down.
- **All visible text goes through i18n.** No German (or English) sentence
  hard-coded — every text lives in `messages/de.json` **and**
  `messages/en.json`. See **Languages** further down.
- **Messages always as a `Callout`.** Notices, success, warning and error
  messages go through `components/ui/callout.tsx` with one of the four
  intents `info` | `success` | `warning` | `danger` — **never** with
  hand-picked color classes (`text-amber-900`, `bg-red-50`, …): the intents'
  token pairs are checked for readability in light **and** dark, your own
  combinations regularly tip over in the mode you weren't looking at. For
  status *inside* running text: `text-success-foreground` &
  `text-danger-foreground`. Short feedback *after* an action ("saved",
  "deleted") is a toast instead — see **UI** for all three mechanisms side by
  side: what has to stay on screen is a `Callout`, what may drift past is a
  toast — including across a `redirect()`, which is the case people forget.
- **Light and dark both count.** Every new piece of UI MUST be readable in
  both modes — that follows by itself as long as colors come from the tokens.
  The shipped toggle is `components/theme-toggle.tsx` (system/light/dark,
  `System` is the default); `dark:` classes follow the `.dark` class on
  `<html>` (`@custom-variant` in `app/globals.css`).
- **Tests are mandatory.** Every feature gets `vitest` tests (blueprints in
  `lib/digistore/*.test.ts`); `npm run test` and `npm run typecheck` MUST be
  green before anything moves on — `node run.mjs test` does both in one go.
  They run **locally** only: nothing runs them for you after a push, so a red
  test that gets committed stays red until somebody looks.
- **Call up the app yourself before you say "done", then ask the log.** Green
  tests are no proof that the page loads, and a page that loads is no proof
  that it rendered — `node run.mjs errors` is the second half of that
  sentence. See **Never ship a broken page** below.
- **Linux, macOS and Windows all count.** Every command in `run.mjs` and
  every script under `scripts/` MUST work on all three — not "mostly": a
  developer on Windows who cannot start the app has no way around it.
  Details, and the reasoning, in **Three systems** further down.

## UI

The app ships with a finished design system. **There is nothing to design
here — there is something to use.** A hand-built button, table or color makes
the app not more individual, only inconsistent: it tips over in dark mode,
has no focus ring and looks different again two pages later.

**A look of its own is not an exception to that rule — it is the skill
`design`.** It fills slots the kit already has (the accent tokens, the font
variables, the radius, the composition of pages from these components),
writes the choice into `docs/design.md`, and licenses nothing beyond them: no
new component, no hex class, no fourth feedback mechanism. When that file
exists, pages follow it.

**This section says which component to reach for.
[`docs/ux.md`](docs/ux.md) says what the app has to do for the person in
front of it** — the first five minutes after a purchase, dead ends, wording,
keyboard and small screens. The auditing skill is `ux-gateway`;
`node run.mjs ux-check` settles the part of it a machine can settle.

**The construction kit** (`components/ui/`, all shadcn/ui):

| For what | Use | Instead of |
|---|---|---|
| Button, link-as-button | `<Button>` (`asChild` for `<Link>`) | `<button className="…">` |
| Input field, label | `<Input>`, `<Label>`, `<Textarea>` | raw `<input>` |
| Selection | `<Select>` (with `name` for the form) | raw `<select>` |
| Yes/no, one-of-several, on/off | `<Checkbox>`, `<RadioGroup>`, `<Switch>` | raw `<input type="checkbox">` — with one exception: a plain-POST form that must work without JavaScript keeps the native input, styled from tokens (`app/plans/page.tsx` shows why, above its checkbox) |
| Box with content | `<Card>` + `CardHeader/Content/Title` | `<div className="rounded-lg border">` |
| List of records | `<Table>` + `TableHeader/Row/Cell` | raw `<table>` |
| Form in a window | `<Dialog>` | your own overlay logic |
| Confirmation before something destructive | `<AlertDialog>` | `confirm()` |
| Actions per row | `<DropdownMenu>` | a row of small buttons |
| Status, role, marker | `<Badge>`, `<RoleBadge>` | a colored `<span>` |
| Empty list | `<EmptyState>` | a blank area |
| Page header | `<PageHeader>` | your own `<h1>` |
| What a new customer should do first | `<OnboardingChecklist>` | an overview that explains nothing |

**The four rules that count:**

1. **Every action reports back — a `redirect()` is not an excuse.** An action
   without feedback feels like an error, and the place feedback silently goes
   missing is the page boundary. There are **three** mechanisms, and between
   them they cover every case — pick by *where the result has to appear*,
   never invent a fourth:

   | The result… | Use | Where |
   |---|---|---|
   | has to **stay** on screen (a state, a warning, a prerequisite) | `<Callout variant=…>` | `components/ui/callout.tsx` |
   | comes from a **server action on the same page** | `useActionToast(state)` | `hooks/use-action-toast.ts` |
   | belongs to something that ended in a **`redirect()`** | `<FlashToast>` | `components/flash-toast.tsx` |

   Server Actions return `{ error, ok }`; the page calls
   `useActionToast(state)` and gets success in green, errors in red.
   `<FlashToast>` fires once and then strips its query parameter, so a reload
   does not repeat the message. **The message never travels in the URL** —
   the parameter carries a *reference* (an id) that the receiving page looks
   up, because a URL carrying the sentence itself lets anybody make your app
   say whatever they typed. The worked example (the purchase chain) is in
   **[`docs/ux.md`](docs/ux.md)** → *Every action reports back*.
2. **Everything destructive asks first.** Deleting, cancelling, resetting run
   through `<AlertDialog>` and name *what* gets hit while doing so
   ("delete customer@example.com?"). The confirm button is red
   (`variant="destructive"`), never in the accent color.
3. **Every new page goes into the shell.** Protected pages live under
   `app/dashboard/…` and inherit sidebar and header from
   `app/dashboard/layout.tsx`; navigation is one line in `NAVIGATION`
   (`components/app-shell.tsx`) — plus the text in both language files.
   And it ships its **empty state in the same commit**: any list, table or
   result area that can legitimately hold nothing gets `<EmptyState>` with a
   sentence and, where there is one, the button that fills it — never a blank
   `<Card>` or a bare heading. Empty is the state most customers meet first,
   and the one nobody remembers to add afterwards (`docs/ux.md` §1).
4. **Both modes, always.** Colors come from tokens (`bg-card`,
   `text-muted-foreground`, `bg-primary`), never from Tailwind palettes
   (`bg-blue-600`, `text-gray-500`). Then light and dark work out by
   themselves.

**Recoloring** (the whole look): `--primary`, `--primary-foreground` and
`--ring` in `app/globals.css`, in **both** blocks (`:root` and `.dark`) —
nothing more is needed, the file explains what to watch out for. The guided
way to choose the colour, type pairing and page style is the skill `design`;
run `node run.mjs ux-check` after any recolour either way.

**The app icon**: `app/icon.png` + `app/apple-icon.png`, picked up by file name
(nothing to register). What ships is a placeholder — **replace both with your own
logo** (square PNG, same names, ~256×256 / 180×180); the name beside it comes
from `APP_NAME` (`lib/app.ts` / `NEXT_PUBLIC_APP_NAME`), not from these files.

**Blueprint page:** `app/dashboard/admin/users/` — table, create dialog, row
menu, delete confirmation, toasts and translation in one piece. Whoever
builds an admin page looks there first.

## Languages

The app is bilingual (German, English) — **without a language prefix in the
URL**. The language comes from a cookie (toggle in the sidebar), on the first
visit from the browser; it is wired up in `i18n/`, the texts live in
`messages/de.json` and `messages/en.json`.

**The rule: no visible text in the code.** Every sentence, label, placeholder
and error message belongs in *both* language files. Identifiers in the code,
by contrast, are **English** (`createUserAction`, `emailPlaceholder`) — the
user never sees them.

```tsx
// Server component (client components: useTranslations)
const t = await getTranslations("users");
<h1>{t("title")}</h1>

// Text with markup (e.g. <code>) — don't stitch it together:
t.rich("hint", { code: (chunks) => <code>{chunks}</code> })
```

**Three things that regularly go wrong here:**

- **Error messages deep in the code.** Rule and database layers MUST return
  *codes*, not sentences (`lib/users/rules.ts` → `"selfDelete"`); only the
  Server Action translates them (`app/dashboard/admin/users/actions.ts`) — a
  sentence that comes into being in `lib/` is always in exactly one language.
- **Date and price.** `useFormatter().dateTime(…)` or
  `formatPrice(def, locale)` — never `toLocaleDateString("de-DE")`. Prices
  are only *written* differently, never converted: what gets billed is what
  is on file at Digistore24.
- **Only one file maintained.** `i18n/messages.test.ts` breaks the build when
  one language is missing a key, a placeholder or an error code — it is the
  reason the second language doesn't rot. Never switch it off.

**Not translated** (deliberately): product names, plan features and
descriptions from `config/digistore-products.json` — that's your product
copy, and at Digistore24 the same text is on file. Likewise the app name
(`lib/app.ts`) and the terminal output of the scripts in `scripts/`.

**A third language**: create a file in `messages/`, register the code in
`i18n/config.ts` (`LOCALES` + `LOCALE_LABELS`) — done.

## Never ship a broken page

**Before you tell the user that something is done, you MUST call the page up
yourself.** Without exception. Green tests and a successful build do NOT rule
out an app that greets the user with "Internal Server Error": `vitest` checks
logic without rendering, `npm run build` checks compilability without a
database and without a real `.env` — a missing environment value, a query
against a column the migration never created, a forgotten `await` on `params`
all compile cleanly and blow up only on the first request.

The routine once you have built or changed a page:

```bash
node run.mjs start                # DB + migrations + app
node run.mjs smoke                # calls EVERY page and reports server errors
node run.mjs errors               # what the log picked up — including on a 200
```

`node run.mjs smoke` (`scripts/dev/smoke.mjs`) finds the pages by itself under
`app/` and calls them in **two passes**: first anonymously, then — signed in as
the owner — exactly those that sent it to `/login`, so the pages with the real
queries get rendered, not just counted as redirects. It rates them like this:

- **5xx** → error. Fix it, don't argue it away, don't pass it on as a "known
  issue".
- **307 to `/login` without a session** → correct; that answer says nothing
  about the page — the second pass is what renders it.
- **307 to `/login` *with* a session** → error. The session did not take, so the
  page still has not been rendered by anybody.
- **307 anywhere else while signed in** → fine. That is what a `hasPlan()` gate
  looks like from the outside.
- **2xx** → fine.

**The second pass can be unavailable, and then it says so** — one line naming
the reason (it signs in via `scripts/dev/sign-in.mjs`: local app in DEV, no
mail transport, an `owner` account to sign in as). **Read that line.**
"9 protected page(s) NOT checked" is not a pass, and `--no-signed-in` turns the
pass off entirely.

On an error the cause is in the log: `node run.mjs logs`. That's where the real
stack trace is; the page in the browser often shows only the meaningless sentence.

**A 200 is not proof that the page rendered.** When `format.dateTime()` gets
something that is not a date, `Intl` throws — but next-intl **catches** it,
writes the error to stderr and renders `String(value)`: the request answers
200 and the page is visibly broken. The same goes for a missing translation, a
hydration mismatch, and a promise that rejected with nobody awaiting it. That
is what `node run.mjs errors` is for: it reads `.dev/dev.log`, groups findings
by cause with file and line, and exits non-zero — so it can gate a "done".
`smoke` runs it around its own sweep; after clicking through the app yourself,
run it by hand.

Three things `node run.mjs smoke` cannot do:

- **Dynamic pages** (`app/…/[id]/page.tsx`) are skipped — call them up by hand
  once with a real record.
- **It is signed in as the OWNER, and as nobody else** — it never sees what a
  `member`, a non-buyer or a blocked account gets. A gate needs a test
  (`vitest`, on the rule) or your own eyes; a green smoke test is not evidence
  that a gate holds.
- **A green smoke test means "loads", not "is correct".** For everything to do
  with money, roles and customer data, a look at the page itself is part of
  the job.

### A hydration mismatch is not always yours

A hydration error naming one of your components may be a browser extension
(Dark Reader, Grammarly) rewriting the DOM before React hydrates — read the
printed attribute diff, not the trace. **The fix is never in your component**,
and `suppressHydrationWarning` MUST NOT be added below `<html>`. Full
post-mortem: **[`docs/troubleshooting.md`](docs/troubleshooting.md)** → *A
hydration mismatch is not always yours*.

### Several copies on one machine — the sign-in that breaks for no reason

A sign-in answering "An unexpected response was received from the server" with
no POST in the dev log is the `localhost` cookie jar past Node's 16 KB header
limit (431) — the login page is fine; clear the cookies for `localhost`
(DevTools → Application → Cookies). The week TTL and the 6 KB cleanup threshold
in `lib/auth/cookie-names.ts` / `proxy.ts` are load-bearing and MUST NOT be
"simplified" away. Full post-mortem:
**[`docs/troubleshooting.md`](docs/troubleshooting.md)** → *Several copies on
one machine*.

## Adding a feature

1. Extend the data model in `db/schema.ts` → `node run.mjs db-generate` (creates a
   migration in `drizzle/`) → check the file → `node run.mjs db-migrate`. The
   migration belongs in the commit. Details: `docs/database.md`.
2. Build the protected page/route under `app/dashboard/…`; gate
   purchase-dependent content with `hasPlan(memberId, productKey)` from
   `lib/entitlements/manage.ts` — never on a billing table. See **Access** below.
   Shell and navigation: see **UI**.
3. Assemble the UI from `components/ui/`; fetch what's missing with
   `npx shadcn@latest add <component>`.
4. **Texts in `messages/de.json` and `messages/en.json`** — both, otherwise
   `i18n/messages.test.ts` fails. See **Languages**.
5. **Write tests** (`vitest`) for the new logic/rules.
6. `npm run typecheck && npm run test` (green) before the deploy.
7. **`node run.mjs start && node run.mjs smoke && node run.mjs errors`** — call the
   new page up yourself, signed in, then ask the log. Only then is it done
   (see "Never ship a broken page").
8. **`node run.mjs ux-check`**, then look at the page as the customer: empty
   state, actions that report back, readable in dark mode and at 380 px —
   thirty seconds each, and they are the three that get skipped. The full pass
   is the skill `ux-gateway`; the rules are [`docs/ux.md`](docs/ux.md).
9. **One entry in `docs/app.md`** — the page's path, the access gate as code,
   the tables, the tests. See **This app's own notebook** below.

### This app's own notebook — `docs/app.md`

**CLAUDE.md describes the template, which every app gets; `docs/app.md`
describes THIS app, which nobody else has.** It is created by the skill
`build-app` (step 4b — the shape lives in its `references/app-md-template.md`)
and grown by the last step above: one entry per feature, written the moment the
feature works. What is not in this file gets built a second time.

Two rules keep it worth reading:

- **Quote the access gate, do not describe it.**
  `hasPlan(memberId, "basis_monatlich")`, never "only for paying customers".
- **Write down what was decided *against*, and why** — the rejected alternative
  cannot be read out of the code, and it is what gets proposed again three
  sessions later.

The session greeting names any page under `app/dashboard/` the file does not
mention (`scripts/dev/session-start.mjs`, logic and tests in
`scripts/dev/app-notes.mjs`) — a hint, not an error, but the one that decides
whether session twenty knows what session three did.

### Dates and raw SQL

**Drizzle converts a column. It never converts raw SQL** — a ``sql`…` ``
expression has no mapper, so a timestamp arrives as the Postgres string and the
page breaks at a clean 200. `sql<Date>` (any Date-typed `sql<…>`) is forbidden;
`db/sql-cast.test.ts` fails on it, and `sql-cast-ok` exempts a line that
genuinely must say it. **Never "fix" it with `new Date(value)`** — the string
has no zone marker, so the timestamp silently shifts by the host's offset. The
three ways out, each one line:

- ``sql`…`.mapWith(grants.createdAt)`` — borrow the column's mapper
- `sql<string>` + `to_char(…)` — make it honestly a string
- select the column and aggregate in JS

A `Date` that crossed JSON is a string despite its type — convert on arrival.
Every **nullable** date MUST be guarded at the call site:
`format.dateTime(null)` renders *1 January 1970*, `undefined` renders *today*,
and neither throws nor logs. Full post-mortem with the measured example:
**[`docs/troubleshooting.md`](docs/troubleshooting.md)** → *Dates and raw SQL*.

## Users & roles

The `users` table has a `role` field (`db/schema.ts`): **`owner`** — SAAS
operator, admin areas; **`member`** — regular customer (the default for self
sign-in). **The first account in a fresh app becomes `owner` by itself — in
DEV only** (`lib/users/bootstrap.ts`): a freshly deployed PROD instance has an
empty user table too, and the first visitor may be a customer, so in
STAGING/PROD the operator MUST create their account up front with
`node run.mjs user-create` (below). Sessions are JWTs, so a promotion shows up
on the next sign-in only.

`users.checkoutToken` (`ensureCheckoutToken()`) corroborates the member id in
`tracking[custom]`; it is **not** a credential — never remove it as unused.
`orders` records who bought what: `memberId` (null while unattributed),
`productKey`, `credits`, `ds24PurchaseId` — written at payment time, never
reconstructed later.

**Securing admin areas:** server components MUST call `requireOwner()`
(`lib/authz.ts`) as the first line (no sign-in → `/login`, no owner →
`/dashboard`); blueprint `app/dashboard/admin/page.tsx`, pure checks
`isOwner(role)` / `hasRole(role, [...])`. **Every Server Action starts with
`requireOwner()`** — an Action is an HTTP endpoint of its own and is not
protected by the fact that the page is.

**User admin:** `/dashboard/admin/users` (logic `lib/users/manage.ts`, safety
rules as pure functions in `lib/users/rules.ts`). An Operator may change an
address there **without a confirmation link** (support acts on a call), but
`setUserEmail()` MUST NOT be exposed to the Member as self-service. There is no
"set a password for this user", and there will not be: a password the Operator
chose is a password the Operator knows.

**The Member's own page is `/dashboard/account`.** Its actions start with
`requireActiveUser()`, not `requireOwner()`, and none of them takes a user id
from the form — the account acted on is always the session's own, which is what
makes an IDOR impossible rather than merely unlikely. Build Member-facing
settings there, never a second page.

**Email change (`lib/email-change/`): a Member changes their own address by
proving they can read mail at the new one.** Requesting changes nothing; only
following the link does. `/account/confirm-email` is public on purpose — the
single-use token is the authentication. Confirming SETS `emailVerified`, where
the Operator's `setUserEmail()` clears it: there an address is asserted, here
the click IS the proof. Rate limits, one-pending rule, purchase claims, JWT
staleness: **`docs/auth-setup.md`** → *Changing the email address*.

**One Member, whole:** `/dashboard/admin/users/<id>` is the support page —
token ledger via `listLedgerFor()`, every grant ever held via `listGrantsFor()`
labelled by `grantState()`. Three actions, all demanding a written reason (read
`guardrails` before changing them):

| Action | Rule |
|---|---|
| **Correct the balance** | `adjustTokens()` (`lib/tokens/account.ts`) → `decideAdjustment()` |
| **Grant a plan by hand** | `grantByHand()` (`lib/entitlements/manage.ts`) → `canGrantByHand()` |
| **Revoke a manual grant** | `revokeGrantByHand()` → `canRevokeGrant()`. **Irreversible** |

Two refusals, both written as pure functions, never left to the form:

- **A token package MUST NOT be handed out as a grant** — a balance is not an
  entitlement, and `hasPlan()` would answer `false` for such a row for ever.
- **Only `source: "manual"` rows can be revoked**, and the refusal lives in the
  `UPDATE` itself. Purchased access ends by Digistore24 event only — see the
  table under **Access**.

A bounded manual grant ends at the **end** of the chosen day
(`accessUntilFromDay()`, UTC) — always render such dates with
`timeZone: "UTC"` (see **Access**). The reasoning, and why two identical
manual grants are legal: **`docs/entitlements.md`** → *The Operator's support
page*.

**Impersonation:** an Operator can sign in as one of their customers (row menu
on `/dashboard/admin/users`). It exists because the alternative is worse:
without it, seeing what a customer sees means `setUserEmail()` to an address
you control and back — a foreign address on the account, and mail about a
change they never made. While it runs **the session IS the member** —
every `requireOwner()` refuses; `session.user.impersonation` is set only during
one. Four properties, all load-bearing:

| | |
|---|---|
| **Narrow** | owner → member only. Never another owner, never a blocked account, never yourself, never chained. `canImpersonate()` in `lib/users/rules.ts` |
| **Visible** | an undismissable banner on **every** page, from the root layout — not from `AppShell`, which stops at `/dashboard` |
| **Bounded** | 30 minutes, then it ends by itself |
| **Recorded** | one row in `impersonations`, written **before** the session changes |

- **The record is the authorisation, not a log line.** The `jwt` callback
  rewrites the session only if the record row already names the caller as its
  operator — never write the row after the swap, never take a member id from
  the payload (`lib/impersonation/session.ts`;
  `lib/impersonation/guard.test.ts` fails the build on it).
- **The exit action deliberately does NOT call `requireOwner()`**
  (`app/impersonation-actions.ts`) — by then the session says `member`, and the
  check would lock the Operator inside. Guard: `canStopImpersonating()`; the
  action takes no id at all.
- **Automatic top-up is suppressed** (`lib/tokens/spend.ts`) — spending the
  balance is allowed, charging a stored card with nobody there to agree is not.

Kill switch: `"enabled": false` in `config/impersonation.json`
(`isImpersonationEnabled()`; a malformed file counts as off). Audit:
`/dashboard/admin/impersonations`, in `node run.mjs data-export`, kept 12
months (`docs/data-protection.md` §12); what was *done* while inside is
deliberately not recorded anywhere.

**Blocking** (`users.blockedAt`) takes effect in two places, and both are
needed (`lib/users/blocked.ts`): the `signIn` callback in `auth.ts` (no new
sign-in) and `requireActiveUser()` in `app/dashboard/layout.tsx` (ends the
running session — sessions are JWTs and carry sign-in-time state, so without
this a blocked user stays in until the JWT expires). Blocked users land on
`/login?error=AccessDenied`.

**Passwords are optional and never replace the magic link** — the link stays
the default and is never taken away. **There is no password reset, and none is
missing — by design**: whoever forgets theirs signs in with a link exactly as
before and sets a new one.
⚠️ Since `/login` became a two-step dialog, that recovery path hangs on ONE
button: **"send me a link instead"**, on step 2 beside the password field
(`app/login/ui.tsx`). An address with a password is routed to the password
field and nowhere else, so deleting that button as redundant would leave
everybody who forgot theirs with no way in at all.
Failed attempts are rate-limited (`lib/rate-limit.ts`) and that limit is not
optional: ten per quarter hour per address, thirty per origin. Every credential
change mails the Member, and that notice MUST NOT contain a link — a security
notice that acts on a click is a phishing template with your sender address on
it (`lib/email.test.ts` asserts this). The password sign-in refuses blocked
accounts **twice** — in `verifyPasswordLogin()` and again in the `signIn`
callback; that redundancy is deliberate, do not tidy it away. The sign-in
dialog (`routeForSignIn()`), the file layout and the notice-mail rules in full:
**`docs/auth-setup.md`**.

> Role helpers (`roleLabel`, `isRole`, `ROLES`) live in `lib/roles.ts`, not in
> `lib/authz.ts`. Client components must import from `lib/roles.ts` — `lib/authz.ts`
> hangs off `auth.ts` and would drag mail delivery into the browser bundle.

**CLI** (idempotent upsert by email; dry run is the default, only `--apply`
writes — details `scripts/users/README.md`):

```bash
node run.mjs user-create --email owner@example.com --role owner --apply
node run.mjs user-list                       # or: … user-list --role owner
```

## Access — what a Member may use

Two functions, both in `lib/entitlements/manage.ts`, and nothing else:

```ts
import { hasPlan, entitlementsFor } from "@/lib/entitlements/manage";

// One feature, one plan — this is the check. A token package is a BALANCE,
// not an entitlement, and always answers false here.
if (await hasPlan(memberId, "basis_monatlich")) { /* show it */ }

// Everything at once, for a list or a badge.
const owned = await entitlementsFor(memberId); // [{ productKey, source, accessUntil }]
```

`accessUntil` MUST be rendered with an explicit `timeZone: "UTC"` — it stores
the last millisecond of a day, so without the pin every viewer ahead of UTC
reads the next day — and `null` gets a real sentence ("no end date"), never a
blank cell. Worked example: `app/dashboard/account/page.tsx`.

They read `grants` — the app's own answer to "may this person use this". They
MUST NOT read `orders` (a financial record) or `subscriptions` (a mirror of
what Digistore24 believes): a cancelled subscription keeps access to the end
of the paid period.

The IPN maintains the grants, and the **event** decides — nothing else does:

| Event | What it does to access |
|---|---|
| `on_payment`, `on_payment_subscription_signup` | grants it (and lifts a suspension) |
| `on_refund`, `on_chargeback` | ends it, for good |
| `on_payment_missed` | suspends it — reversible; a fixed card brings it back |
| `last_paid_day` | ends it. This is how purchased access normally expires |
| `on_rebill_cancelled` | **nothing at all.** Billing stops, access runs on |

**A Member can hold two plans at once.** A Digistore24 plan switch delivers two
events days apart, in either order, so an upgrading Member briefly holds both
keys — or neither. Always ask `hasPlan` per feature; `entitlements[0]` is never
"the plan".

**A missed payment makes the plan disappear from both answers** — and is not an
account closure. For the *message* only: `suspendedKeysFor(memberId)` +
`pausedKeys(owned, suspended)` (`lib/entitlements/rules.ts`). Say "your access
is paused", never nothing at all.

Failure modes, the upgrade mechanics, the token balance and worked examples:
**`docs/entitlements.md`**.

### Charging tokens — `spendTokens`

A balance is **not** an entitlement — `hasPlan()` answers `false` for a token
package for ever. Metering usage has one answer:

```ts
import { getTokenAccount, hasSufficientBalance } from "@/lib/tokens/account";
import { spendTokens } from "@/lib/tokens/spend";
import { TokenError } from "@/lib/tokens/rules";
const COST = 5;

// 1. CHECK — before doing anything expensive.
const account = await getTokenAccount(memberId);
if (!hasSufficientBalance(account?.balance ?? 0, COST)) {
  return { error: t("insufficientBalance") };
}
// 2. WORK
const report = await buildReport();
// 3. CHARGE
try {
  await spendTokens({ amount: COST, note: "report generation" });
} catch (err) {
  if (err instanceof TokenError) return { error: t(err.code) };  // AD-10
  throw err;
}
```

**Check → work → charge, in that order.** Charging first bills for work that
then fails; working with no check in front gives the result away for free,
because by the time `spendTokens` throws the expensive part has already run —
and that is the mistake that actually gets made.

Four rules, and the first is the one this function exists for:

- **It takes no member id — never give it one.** The account charged is always
  the session's own (`requireActiveUser()`); a `memberId` out of a `FormData`
  is an IDOR that drains another customer's balance, and an optional parameter
  defaulting to the session only makes the bad call compile again.
  `consumeTokens({ memberId, … })` belongs to the IPN and Operator pages only.
- **The price is yours, computed in code.** Read `amount` from the request and
  the customer sets it to 0.
- **`note` is a label, not content** — it reaches a subject access request
  (`node run.mjs data-export`). "report generation", never what the Member
  typed.
- **It is not idempotent.** Two submissions charge twice — keep a double-click
  off with `disabled={isPending}`, and never build a blind retry around it.

A shortfall throws `TokenError("insufficientBalance")` and writes **nothing**;
`consumeTokens` holds a row lock, so racing requests cannot drive a balance
below zero (the check→charge gap and the deliberate absence of a reservation
system: **`docs/entitlements.md`**). Spending is never gated on `billingMode` —
that switch is cosmetic, and refusing to spend would strand customers still
holding a paid balance.

## The AI assistant

Optional, off until switched on. The guide is
**[`docs/ai-chat.md`](docs/ai-chat.md)**; the skill that writes her handbook is
`ai-chat-knowledge`.

- **Two switches, both required.** `"enabled"` in `config/ai-chat.json` (a
  property of the PRODUCT) and a key for whichever provider her task resolves
  to (a property of the MACHINE) — she ships on `"auto"`, so any one of the
  five keys does. Always read them through `isChatEnabled()` in
  `lib/ai/chat-config.ts`, never by re-reading the JSON. A malformed config
  switches her OFF — the opposite direction from `billingMode()`, because the
  failure mode here is a bill.
- **Which model answers is NOT in `config/ai-chat.json`.** That file holds what
  she IS; which company and model is a property of the TASK
  (`config/ai-models.json`). A leftover `"model"` field there is reported by
  name, never ignored.
- **One `ChatWindow`, two places.** The launcher on every protected page
  (`app/dashboard/chat/launcher.tsx`) and her own `/dashboard/chat` page render
  the same component with a different `variant` — never build a second chat
  component for a second place to put her.
- **She answers only from `content/knowledge/`.** No database, no account data,
  no web — nothing about the signed-in person is ever sent to the API. Gate her
  per plan with `hasPlan(memberId, productKey)` if you want to;
  `requiresPlan: null` means every signed-in member.
- **`app/api/chat/route.ts` guards itself** with `currentActiveUser()`
  (`lib/authz.ts`) — `proxy.ts` matches `/dashboard` only, so every `app/api/`
  route is public until it protects itself.

Worth knowing: the whole handbook travels as a cached prompt prefix, so
anything volatile in the persona raises the input bill roughly tenfold
(`lib/ai/prompt.test.ts` is the guard). A feature switched ON that this machine
cannot run keeps its menu entry for the OPERATOR (`chatNavVisible()` in
`lib/ai/rules.ts`) — read **[`docs/ai-chat.md`](docs/ai-chat.md)** → *Where she
appears* before adding the next optional feature to `NAVIGATION`.

`node run.mjs kb-check` checks the handbook's format and prints what one answer
costs.

## The knowledge corpus — what you know, before the handbook

Optional, and a layer under the assistant: existing material — videos, ebooks,
recordings — distilled into notes the handbook is written FROM. The guide is
**[`docs/knowledge.md`](docs/knowledge.md)**.

- **The corpus informs writing; it never answers at runtime.**
  `content/knowledge-sources/` and the optional `graphify-out/` are read by
  agents while writing, never by the app — no code under `app/`, `lib/` or
  `scripts/` may reference either (`scripts/knowledge-boundary.test.ts` fails
  the build). The chat keeps reading the one curated handbook, whole, cached.
- **The Licence Gate holds at intake.** Third-party material is distilled in
  the vendor's own words with the source cited — never stored verbatim;
  `_raw/` is for `own-content` and `licensed` sources only. The committed repo
  is already distribution, and the rule covers media files exactly as text.
- **One media namespace, two legs.** A reference is `<topic-slug>/<file>` —
  shipped files ≤ 10 MB under `content/knowledge-media/`, larger ones staged
  in `.data/knowledge-media/` and copied by `node run.mjs kb-media-sync` into
  the media store under `knowledge/`. Both legs answer at the session-gated
  `/api/knowledge-media/<path>`, so moving a file between them changes no
  handbook text.
- **The chat offers only what the handbook offers.** A `[media:<path>|<label>]`
  marker renders as a card only when it occurs verbatim in
  `content/knowledge/` — anything else degrades to plain text, so she can
  never invent a link.

Worth knowing: `node run.mjs kb-check` verifies every media reference against
the configured store before a release (an unreachable store is a problem,
never a skip), and nothing with `status: needs-review` in the corpus may reach
the handbook.

## Talking to a language model

Every model call in this app goes through **one entry point**, and it names a
TASK rather than a model:

```ts
import { runTask, streamTask } from "@/lib/ai/run";

const answer = await runTask("chat", { system, messages, memberId });
```

Which of five companies answers — OpenAI, Anthropic, Gemini, Mistral,
OpenRouter — is `config/ai-models.json`, so the Operator changes it without
touching code. The full guide is **[`docs/ai-providers.md`](docs/ai-providers.md)**
and the skill that sets it up is `ai-providers`.

- **No call site ever names a provider, constructs a vendor client or reads an
  API key.** `lib/ai/providers/` is the only place that does, and
  `lib/ai/providers/leak-guard.test.ts` fails the build if that stops being
  true.
- **A task MUST be declared in code**: add its id to `lib/ai/task-rules.mjs`
  AND to the union in `lib/ai/tasks.ts`. Binding it in `config/ai-models.json`
  is optional — a declared task with no entry inherits `default` and works.
- **`"auto"` is the shipped binding** — run on whichever key is in the `.env`.
  Two rules are load-bearing: a binding that NAMES a company is obeyed exactly
  as written (an honest error beats a quiet substitution onto somebody else's
  invoice), and a `model` or `providerOptions` entry must never sit beside
  `"auto"` — `ai-check` refuses the combination.
- **`system` is a LIST of blocks, and everything stable goes first**, marked
  `cacheable: true`. On three of the five providers a stable prefix is worth
  roughly a tenfold difference in the input bill, and getting it wrong produces
  no error at all — a cacheable block after a varying one is refused outright.
- **Every call is recorded in `ai_usage`** — task, provider, model, tokens,
  latency, outcome, member. No prompt and no completion is ever stored there;
  it is a numbers table (`docs/data-protection.md` §10). Recording never fails
  a call — it runs after the response and swallows its errors into a log line.
- **What it cost is one page: `/dashboard/admin/ai-costs`** ("KI-Kosten",
  owners only) — always per currency, never summed across two.
- **There is no spend ceiling, deliberately** — a ceiling takes the app's AI
  offline for real customers, and a hard stop belongs on the provider account.
  Never build one without reading `docs/ai-providers.md` first.
- **`companion` is the task for working alongside your customer** —
  `askCompanion()` (`lib/ai/companion.ts`); what calls it is the app you build.
  Customer data never touches `system`, and what the customer wrote travels
  fenced in `<customer-text …>` — content to answer about, never to follow. Who
  may use one is `hasPlan()`, what a use costs is `spendTokens` in the order
  check → work → charge. A second companion is a second registry entry
  (`lib/ai/companions.ts`), never a second component. 🚨 An entry's `load()` is
  where an IDOR would live — the subject is a string the customer's browser
  sent, so every read inside it is scoped by `memberId`, and `null` is both "no
  such subject" and "somebody else's". Mechanics:
  **[`docs/ai-providers.md`](docs/ai-providers.md)** → *Working alongside your
  customer*; what to build with them:
  [`docs/ai-in-product.md`](docs/ai-in-product.md).
- **A picture is the `image` task, and the provider is not interchangeable.**
  Anthropic makes no images at all, and `ai-check` says so by name at check
  time — never at a customer's first click. `generateImage()`
  (`lib/media/generate.ts`) returns a stored `media` row. Images are billed per
  picture — an `image` rate in `config/ai-prices.json` — and `alt` is required
  and never derived from the prompt, because a prompt is instructions for a
  machine and alternative text is a sentence for a person. Details:
  [`docs/ai-providers.md`](docs/ai-providers.md) → *Pictures*.

`node run.mjs ai-check` shows which task runs on which model, whether the keys
are there, and what one call costs.

## Scheduled jobs — work with no request behind it

Deleting data that has aged out, a nightly reminder, an overnight
reconciliation. It has its own guide: **[`docs/cron.md`](docs/cron.md)**. Five
things are worth knowing before you add one:

- **A job is an entry in `lib/cron/jobs.ts`.** Nothing else. The schedule is
  `config/cron.json` (`everyMinutes`), the app runs it by itself while it is up
  (`instrumentation.ts` → `lib/cron/scheduler.ts`), and `cron_runs` records what
  happened. There is no second list of jobs and no per-job endpoint to write.
- **It must be safe to run twice.** The lock is a conditional `UPDATE` so two
  app instances cannot both take a job — but a stale lock, a redeploy or an
  Operator pressing the button will still get you a second run. Deleting rows
  older than a cutoff is idempotent; sending a mail is not, unless the job
  records that it sent one.
- **It returns one line of NUMBERS and throws on failure.** That line lands in
  `cron_runs.lastDetail` and is what somebody reads to find out whether the job
  works — so no address, no member id, no text anybody typed. Swallowing an
  error makes a broken job look like a healthy one.
- **The schedule is an interval, not a cron expression.** No parser, no
  dependency. If you need a wall-clock hour, switch the in-app scheduler off and
  point the host's cron at `POST /api/cron` — same registry, and crontab is good
  at exactly the thing this file deliberately is not.
- **A retention window is a number a person edits**, so read it with
  `configuredNumber()` from `lib/cron/rules.mjs` and never `Number()`:
  `Number(null)` is `0`, and zero months of retention means *delete everything*.

`node run.mjs cron --list` says what exists, when it last ran and what it said.
`node run.mjs cron --job <id>` runs one now.

## The MCP server — the app as a tool for AI clients

Optional, off until switched on, and it has its own guide:
**[`docs/mcp.md`](docs/mcp.md)**. The skill that decides what to expose is
`mcp-server`. A customer creates a key on `/dashboard/account`, pastes it into
Claude Code or claude.ai, and the model can then use this app **as that
customer**. Five things are worth knowing before you touch any of it:

- **One switch, and it ships OFF.** `"enabled"` in `config/mcp.json`, read
  through `isMcpEnabled()` in `lib/mcp/config.ts` — never by re-reading the JSON.
  Unlike every other optional feature here, off is the shipped state, because an
  unconfigured MCP server does not do nothing: it exposes whatever is in
  `lib/mcp/tools.ts`, and what ships there are EXAMPLES meant to be replaced.
- **`app/api/mcp/route.ts` guards itself.** `proxy.ts` matches `/dashboard`
  only, so everything under `app/api/` is public until it protects itself. There
  is no session on this path at all — the caller proves itself with
  `Authorization: Bearer ds24mcp_…`, and `authenticate()` in `lib/mcp/keys.ts` is
  the ONLY thing that turns that into a member id. It also re-checks
  `users.blockedAt`, because `requireActiveUser()` never runs here.
- **`readOnly` on a tool is a security boundary, not documentation.** A key with
  the `read` scope may run read-only tools and nothing else, and that refusal
  lives in the call path — `tools/list` hiding a tool is cosmetics. Anything that
  writes, charges, mails or costs money is not read-only; `lib/mcp/tools.test.ts`
  fails the build on a tool that says otherwise while charging tokens.
- **No tool ever takes a member id.** The account is `ctx.memberId`, bound to the
  key before the handler runs — the same guarantee `spendTokens` gives a Server
  Action, which is why charging here goes through `spendForKey`
  (`lib/mcp/spend.ts`) and not through `spendTokens` (there is no session to
  authenticate). Every tool argument is written by a MODEL reading text somebody
  else may have authored, so an id among them is an IDOR with a language model
  holding the pen.
- **Keys are shown once and hashed with SHA-256, not scrypt.** Deliberate, and
  the opposite trade from `lib/credentials/hash.ts`: a password is human-chosen
  and needs a memory-hard KDF to make guessing expensive; an MCP key is 32 random
  bytes this app generated, has nothing to guess, and is checked on every single
  tool call — 16 MB of RAM per call would be a denial of service somebody else
  pays for.

`node run.mjs mcp-check` checks the settings; `--live` mints a temporary key and
really calls the endpoint, which is the only check that covers the whole path.

## The HTTP API — the app as a backend for the customer's own programs

Optional, off until switched on, and it has its own guide:
**[`docs/api.md`](docs/api.md)**. The skill that walks through it is
`mobile-companion`. A member signs in once (`POST /api/v1/auth/token`, or the
**App keys** card on `/dashboard/account`), stores the `ds24api_…` key, and
their own program — typically a mobile app, see
[`docs/mobile.md`](docs/mobile.md) — can then read and write as that member.
Five things are worth knowing before you touch any of it:

- **One switch, and it ships OFF.** `"enabled"` in `config/api.json`, read
  through `isApiEnabled()` in `lib/api/config.ts` — never by re-reading the
  JSON. A malformed file counts as off: the failure mode of this switch is an
  open endpoint, so every doubt falls towards closed. While off, all of
  `/api/v1` answers 404.
- **Every v1 handler guards itself, through ONE door.** `proxy.ts` matches
  `/dashboard` only, so everything under `app/api/` is public until it
  protects itself — for this surface that is `guardApi()` (`lib/api/guard.ts`)
  as the FIRST line of every handler, and
  `app/api/v1/guard-presence.test.ts` fails the build on a handler that
  forgot (the token endpoint is the named exception; its protection is the
  password check plus the mint meter). Never hand-roll the checks in a route.
- **No endpoint ever takes a member id.** The account acted on is the key's
  owner, bound by `authenticate()` before the handler runs — the same
  guarantee `spendTokens` gives a Server Action. An id in a query string or
  body is a bug, and the read-endpoints test asserts it changes nothing.
- **Keys are audience-bound.** An MCP key (`ds24mcp_`) never opens `/api/v1`,
  an API key (`ds24api_`) never opens the MCP endpoint — refused by prefix
  before any query, and by the `audience` column behind it. A credential must
  not widen by being pasted somewhere else. Scopes are `read`/`write`; a
  writing handler declares `{ scope: "write" }` and the refusal lives in the
  call path.
- **Errors are stable English codes** in `{ "error": "<code>", "detail": … }`
  — the caller is a program. They are deliberately NOT in
  `i18n/messages.test.ts`'s registry (that is for member-facing codes), and
  `/api/v1` is additive: breaking means a new `/api/v2`, never an edit.

`node run.mjs api-check` checks the settings; `--live` mints a temporary key
and really calls `/api/v1/me`, which is the only check that covers the whole
path.

## The mobile companion — the shared core

A mobile app for this product is a separate repo with its own UI that talks
to the HTTP API above — and shares the pure decision layer via
`node run.mjs export-core`. The guide is **[`docs/mobile.md`](docs/mobile.md)**;
the skill is `mobile-companion`. Shipping to the stores runs through **Expo's
EAS** — managed signing (nobody handles certificates), cloud builds (an iOS
build needs no Mac), store submission, OTA updates and push, all CLI-driven;
the accounts are connected once and the path is
[`docs/mobile.md`](docs/mobile.md) → *Shipping the companion*. Four
invariants:

- **The cut is `config/core-export.json`, and purity is the admission test.**
  A file goes in only when it and its whole import closure are free of
  react/next/db/node-builtin/npm imports and `process.env` —
  `scripts/core/purity.test.ts` enforces it on every test run. Never silence
  it with `core-pure-ok` to get green; the honest fixes are cut the import,
  extract the pure part, or leave the file out.
- **`export-core` never overwrites a file edited in the target repo.** Same
  contract as `node run.mjs update`, applied to code: `.core-version` in the
  target records what was exported, only still-matching files get replaced,
  nothing is ever deleted. Plan first, `--apply` writes.
- **Signing and secrets stay on the server, deliberately.**
  `lib/digistore/{client,ipn,buyUrl}.ts` are kept OUT of the core — signing
  code in a mobile bundle invites embedding the secret beside it, and a
  mobile binary is public. Checkout URLs and purchase state come from the
  API.
- **Renaming or deleting a manifest file is a breaking change** for every
  exported copy — the companion's imports go red and the export only says
  `withdrawn`. Treat manifest paths with the same care as API routes.

## Media — pictures, video, recordings and the files you sell

Anything the app puts in front of a customer that is not text goes through one
place, `lib/media/`. It has its own guide: **[`docs/visuals.md`](docs/visuals.md)**.

- **Four kinds from the start — `image`, `video`, `audio`, `file`.** Delivery,
  the size ceiling and the byte-signature check are decided per kind, so a new
  file type is a row in a table, never a second store beside the first.
- **The bytes live in a bucket.** DEV writes to `.data/media/` with nothing to
  set up; in STAGING and PROD `MEDIA_DRIVER=local` stops the app from starting
  (`lib/env-guard.ts`), because a local disk loses every file on the next
  redeploy and serves a customer's picture about half the time on two nodes.
  Any S3-compatible provider works; the app signs its own requests
  (`lib/media/sigv4.mjs`), so no SDK is involved.
- **A file never travels through the app on its way out.** `public` items come
  from the bucket or its CDN; `owner` and `entitled` items are authorised by
  the server component **while it renders** — `mayAccess()` — which then mints
  an address that expires. `mediaUrlFor()` **grants nothing** — it is the step
  after `mayAccess()` said yes, and calling it without that check is how a
  private file becomes public.
- **Selling a file is a visibility and a Product Key**, not a feature:
  `visibility: "entitled"` plus `requiresPlan`, and `hasPlan()` decides. The
  key is validated when it is written, because `hasPlan()` **throws** on an
  unknown one — an unchecked value would take the page down, not mean "no
  access".
- **What a file IS comes from its first bytes** (`lib/media/sniff.ts`), never
  from the `Content-Type` the request claimed. Who may upload what is per ROLE
  (`config/media.json` → `mayUpload`); archives are the operator's. No SVG
  anywhere — it is a document that can carry script.
- **Location data comes off uploaded images (JPEG, PNG, WebP), and not off
  video** (`lib/media/exif.ts`) — `docs/data-protection.md` says so rather than
  implying a protection that is not there. Deleting an account removes the
  **objects**, not only the rows.

Uploads travel through the app, which is where they are checked — so there is a
ceiling, per kind, in `config/media.json`. Beyond it the browser has to write
straight to the bucket, and that path is deliberately not built yet;
`docs/visuals.md` says what it involves.

`node run.mjs media-check` writes a throwaway object, reads it back, deletes it,
and prints what may go in.

## Plans & Digistore products

**One fork comes before every other billing question: whose Digistore24 account
gets paid.** The default — the operator is the only vendor — is fully built and
is what everything below assumes; the **platform** shape (the app's own users
connect *their* Digistore24 accounts and get paid) is NOT built and is not a
setting. Do not build the platform shape "just in case". Both shapes and the
decision question: **[`docs/digistore-integration.md`](docs/digistore-integration.md)**.

The plan list in `config/digistore-products.json` is the **single source** — it
feeds the plans page (`app/plans/page.tsx`) *and* the sync script. Never create
a second price list in the code.

**One offering is one Digistore24 product PER LANGUAGE, not one product** — a
product carries exactly one `data[language]`, the language of the order form,
and `createBuyUrl` cannot override it:

```json
"basis_monatlich": { "productIdByLanguage": { "de": null, "en": null } }
```

`node run.mjs ds24-sync` creates one product per entry and writes the ids back;
the visitor's locale picks the checkout target (`checkoutProductFor` in
`lib/digistore/products.ts`). Cover every locale from `i18n/config.ts` — a
missing one still sells, but on another language's form, and `ds24-sync` is the
only thing that ever says so. Full reasoning:
[`docs/digistore-integration.md`](docs/digistore-integration.md) → *The order
form's language*. **Your product copy is deliberately not translated** —
`name`, `description`, `tagline` and `features` are one text, sent to every
language product (see **Languages** above).

**What this app sells is one line in that same file**, and it is the first
thing to set:

```json
{ "billingMode": "subscriptions" | "tokens" | "both", "products": { … } }
```

`"both"` ships as the default; the other two hide the surfaces of the unused
model. Read it through **`lib/billing-mode.ts`** (`sellsPlans()` /
`sellsTokens()`), never by re-reading the JSON. Four rules make it safe to flip
on a live app (long form: [`docs/digistore-billing-modes.md`](docs/digistore-billing-modes.md)):

- **It is COSMETIC. It never decides access.** `hasPlan()`, `entitlementsFor()`,
  `consumeTokens()` and the IPN behave identically in every mode.
- **A mode may hide an empty thing, never a non-empty one.** Every call site is
  written `!sellsTokens() && balance === 0`, never `!sellsTokens()` alone —
  write new ones the same way.
- **`adjustTokens()` refuses in a subscriptions-only app**
  (`TokenError("tokensNotSold")`); to correct a legacy balance, set the mode back.
- **Mode and registry must agree** — `lib/billing-mode.test.ts` fails the build
  on a token package declared in a `"subscriptions"` app.

Deleting the sample products you do not sell is part of setting the mode.
Removing one from the JSON does **not** unpublish it — deactivate it at DS24.

The commands:

- `node run.mjs ds24-connect` — fetch the API key (browser) into the `.env`.
- `node run.mjs ds24-sync` — create/update products **and** the IPN connection
  (idempotent). This one **applies**; the preview is `--dry-run`.
- `node run.mjs ds24-approval --apply` — request product approval; without
  `--apply` it is the status view. **Approval is a go-live step** — before it,
  only test purchases, and in DEV every checkout link carries the DS24
  test-payment parameter by itself (`lib/digistore/testpay.ts`). Marketplaces,
  Direct Sellers, refusal behaviour, greeting/doctor check and kill switch:
  **[`docs/digistore-integration.md`](docs/digistore-integration.md)**.

**Never hand a raw localhost URL to the DS24 API** — Digistore24 stores public
https URLs only, so every local URL travels as a redirect back to your machine
(`http://localhost:3000/… → https://ds24-appkit.com/redir/?port=3000&path=…`).
That happens by itself, in `scripts/ds24/_public-url.mjs` and
`lib/digistore/public-url.ts` — the two are twins; change one, change the other.

**The IPN endpoint is the exception.** Digistore24 calls it *itself*, so it
needs a genuinely public URL — `ipnSetup` proves it by fetching the address and
insisting on HTTP 200, and it refuses even a 301/302.

**`node run.mjs ds24-sync` sorts that out by itself**: with a local `APP_URL` it
opens a free Cloudflare Quick Tunnel and says so — your machine is reachable
from the internet while it runs. A **dry run never opens one**. `node run.mjs stop`
closes it; `node run.mjs start` re-opens it and re-points Digistore24 via the
stable `domain_id`. Details: [`docs/environments.md`](docs/environments.md).

**That `domain_id` MUST be unique as well as stable** — Digistore24 finds a
connection by (merchant, API key, `domain_id`), so a generic value silently
re-points another app's IPN at this one. Derived ids end in a random tail; an
id you pass with `--domain` is yours to make unique.

**"Paid, but nothing happened in the app" has a command, not a theory:**
`node run.mjs ds24-purchase --order ABC12345`; a *rejected* IPN is `node run.mjs ds24-ipn-verify`.

**Leave `APP_URL` alone** — a non-local value switches off the development
login (`lib/auth/dev-login.ts`) and locks you out of your own app.

**Prices don't belong on the DS24 product** — the API discards `data[amount]`.
`priceCents` and `billingInterval` travel with every `createBuyUrl` call as
`payment_plan[...]`; the DS24 UI needs **no** payment plans. **One price, one
place: `config/digistore-products.json`.** Why not `createPaymentPlan`:
[`docs/digistore-integration.md`](docs/digistore-integration.md) → *The checkout*.

## Local commands

Everything runs through `run.mjs` (`node run.mjs` on its own shows the
overview). Arguments go straight through — there is no `ARGS="…"` wrapping.

- `node run.mjs doctor` — what has to be installed and what is missing here; `--json` gives it as data with per-system install commands (what the skill `setup-machine` reads)
- `node run.mjs setup` — get the project ready without starting it: `.env`, dependencies, database, pending migrations
- `node run.mjs start` — database + migrations + app (http://localhost:3000); occupied ports resolve themselves (remembered in `.dev/port`, `DB_PORT`/`DATABASE_URL` pulled along); a running instance of **this** project aborts the start instead of doubling; force with `--port 3005`
- `node run.mjs stop` — stop app + database · `node run.mjs restart` · `node run.mjs logs` · `node run.mjs status`
- `node run.mjs test` — TypeScript check + tests (including the IPN signature verification)
- `node run.mjs smoke` — call every page once; finds "Internal Server Error"
- `node run.mjs errors` — the errors that leave the status code at 200 (a bad date, a missing text, a hydration mismatch); non-zero exit when it finds something
- `node run.mjs ux-check` — the countable half of `ux-gateway`: token contrast in both modes, hard-coded colours, hand-built elements, unnamed icon buttons, pages in no menu — green means counted, not good
- `node run.mjs ai-check` — which task runs on which model, are the keys there, what does a call cost
- `node run.mjs mcp-check` — check the MCP server's settings; `--live` really calls it once
- `node run.mjs api-check` — check the HTTP API's settings; `--live` mints a key and really calls it once
- `node run.mjs export-core <dir>` — copy the shared core into a companion repo (plan; `--apply` writes)
- `node run.mjs media-check` — where uploaded files go, whether that place answers, and what may go in
- `node run.mjs kb-media-sync` — copy the assistant's large media files (`.data/knowledge-media/`) into the media store; dry run by default, `--apply` writes
- `node run.mjs db-generate` / `node run.mjs db-migrate` — create / apply a migration
- `node run.mjs db-reset` — clear the local DB, migrate, seed (**locally only**)
- `node run.mjs cron` — the scheduled jobs: run what is due, `--list` them, `--job <id>` to force one
- `node run.mjs db-prune-ai` — delete AI-usage rows older than a year (`--dry-run` first)
- `node run.mjs user-create --email … --role owner --apply` — create an operator/admin account
- `node run.mjs data-export --email …` — everything held about one person, as JSON (subject access request)
- `node run.mjs mail-setup` — set up mail delivery (Postmark or SMTP) + test mail
- `node run.mjs ds24-connect` — fetch the Digistore24 API key and store it in `.env`
- `node run.mjs ds24-purchase --order …` — what Digistore24 holds for one order; the first command when a purchase "did not arrive"
- `node run.mjs ds24-testpay` — show the test-purchase key (DEV appends it to every checkout link by itself); `--recreate` rotates it — do that before go-live; never active outside DEV
- `node run.mjs ds24-tunnel` — public address onto the local app **and** the IPN registered on it (background; `status` shows it, `stop` ends it)
- `node run.mjs build` — production build
- `node run.mjs update` — bring the **guidance** up to date: this file, `docs/` and `.claude/skills/`, nothing else. See **This app is a copy** below.

The npm scripts behind them remain usable; when in doubt name the
`node run.mjs` command — it is the one meant for non-developers and the one
that works on all three systems (see **Three systems**). There is still a
`Makefile`, but it only forwards here; never point the user at `make`, it is
missing on Windows.

### What the first install prints

npm says three things on the first `node run.mjs start`, and only one of them
is real — and dev-only. The deprecation warnings and the
`9 high severity vulnerabilities` are known: all nine sit in `devDependencies`,
and `npm audit --omit=dev --audit-level=high` is `found 0 vulnerabilities`. An
`ERESOLVE` block is a regression — `scripts/deps.test.ts` fails on it. **The
two obvious fixes are both refused**: `eslint@10` makes things worse, and the
`minimatch@10` override ships a crash into the first app that enables the
wrong lint rule. Report the nine as known and dev-only, and leave them; the
full reasoning is in **[`docs/troubleshooting.md`](docs/troubleshooting.md)** →
*What the first install prints — and which of it is real*.

## This app is a copy — keep its guidance current

The template this app came out of keeps being worked on. The code here is the
customer's and nobody changes it behind their back; **this file, `docs/` and
`.claude/skills/` are a different matter** — they are how you know what the app
can already do. Six-month-old copies of them are how a feature that shipped long
ago gets rebuilt by hand, worse, next to the one that was already there.

```bash
node run.mjs update           # what would change — writes nothing
node run.mjs update --apply   # write it
```

Four properties, and knowing them is enough to use it correctly:

- **Text only.** `CLAUDE.md`, `README.md`, `docs/*.md`, `.claude/skills/**`.
  Never `app/`, `lib/`, `db/`, `config/`, `messages/`, `scripts/` — a doc cannot
  collide with a page somebody built, a `lib/` file can.
- **A file that was edited here is left alone.** `.template-version` holds the
  hash each file had when this app was created; only files that still match get
  replaced, and the rest are reported as `keep`. So house rules written into this
  file survive an update. **Do not "fix" that by overwriting them anyway.**
- **A skill that declares `requires:` above this app's `package.json` version is
  refused.** Knowledge without its code is worse than none — you would describe
  a feature and then find nothing of it.
- **Nothing is deleted.** A withdrawn skill is reported and stays.

Everything comes from the public repo this app was cloned out of
(`github.com/digistore-io/ds24-appkit`), and the manifest is that repo's own
`.template-version` — so there is no second copy of the truth to drift. The
greeting checks once a day and says one line when something is new
(`scripts/dev/update-check.mjs`); it is one GET of one public file, reaches no
server of ours, and is switched off with `TEMPLATE_UPDATE_CHECK=off`.

**Do not run `--apply` on your own initiative.** Show the user what would change,
say in a sentence what it is about, let them decide. "Update the template" is
them deciding. The whole reasoning, including what the update refuses and why, is
in **[`docs/updates.md`](docs/updates.md)**.

## Three systems

**This app has to run on Linux, macOS and Windows.** Claude Code, Codex, Gemini
and OpenCode all run on all three, so all three are places where somebody builds
on this template — a developer on Windows who cannot start it has no way around
it.

**What has to be installed:** **Node.js ≥ 20** (with npm) and **git** — nothing
else. **Docker** is used for Postgres where it exists and is not required where
it does not (see below); **cloudflared** is only for receiving Digistore24 IPNs
on your own machine. **A person installs exactly one of those by hand: git**
(plus the AI program itself); everything after that — Node included — is
installed *here*, by the agent, through `setup-machine`, because the alternative
is a checklist on a web page, and a checklist is where non-developers stop.

```
a person:   the AI program · git · git clone · start it in the folder
the agent:  Node · dependencies · database · migrations · .env
```

**The per-system install commands live in exactly one place:
`scripts/dev/fixes.json`**, read by `scripts/dev/doctor.mjs` — a repeated list
drifts, always for the system nobody here runs; and it is JSON, not code,
because a machine with no Node cannot run `doctor` yet `setup-machine` can
still *read* the table in its step 0. What do I need → `node run.mjs doctor`;
something missing → the skill `setup-machine`; a command changes →
`fixes.json` and nowhere else (`scripts/setup.test.ts` fails if an entry loses
one of the three systems, or if the skill carries install commands of its own).

**macOS does not go through Homebrew.** The `darwin` entries name the way that
works on a Mac as it comes; `darwinFix()` in `doctor.mjs` upgrades them to
`brew install …` at runtime *when brew is already there*. Never turn that around
— a table that assumes brew hands `brew: command not found` to most Mac users.

**No `make`** — missing on Windows entirely, and on macOS until someone installs
the Xcode CLT; commands run through `node run.mjs <command>` (see **Local
commands**). The `Makefile` is only an alias; never point the user at it.

**Docker is used where it is, and replaced where it is not — nobody is asked.**
The first start looks at the machine (`scripts/db/driver.mjs`): a Docker that
*answers* — the daemon, not the PATH — gives `DB_DRIVER=docker`, anything else
gives `DB_DRIVER=local` and Postgres from an npm package (`scripts/db/local.mjs`)
— real Postgres 16, same wire protocol, so `DATABASE_URL`, `db/index.ts`,
`drizzle/` and every script stay untouched. Three properties are load-bearing:

- **It happens once and is written into `.env`** — a Docker Desktop that did not
  start looks exactly like a machine that never had one, and deciding afresh
  would point an existing project at a second, empty database.
- **Existing data outranks the machine.** A `.dev/pgdata` keeps running without
  Docker, even once Docker turns up.
- **A written-down value is obeyed and never overwritten**, and an unknown one
  throws instead of quietly starting the wrong database
  (`scripts/db/driver.test.ts`).

**Never present Docker as a prerequisite**, and never change `DB_DRIVER` on a
project that already holds data — whoever explicitly wants the other way round
changes the line by hand while the database is still empty.

**Windows in practice means Git Bash or WSL2.** Git Bash is the narrower of the
two — write for it and both work.

The traps are always the same — all in the tooling, never in the app code:

| Don't | Because | Instead |
|---|---|---|
| `make` | absent on Windows, needs the Xcode CLT on macOS | a task in `run.mjs` |
| `lsof`, `ss`, `netstat` | not installed everywhere; `lsof` hides other users' sockets | `portInUse()` from `scripts/dev/ports.mjs` (a TCP connect) |
| `pgrep`, `pkill`, `ps -o pgid=` | missing or crippled outside Linux | remember the PID yourself in `.dev/`, then `process.kill(pid)` |
| `kill -TERM -$PGID` (process group) | POSIX process groups do not exist on Windows | kill the remembered PID; spawn children detached |
| `setsid`, `nohup` | Linux only | `spawn(…, { detached: true }).unref()` in Node |
| `sed -i`, `mktemp` | GNU wants no argument, BSD/macOS wants one | `setEnvValue()` from `scripts/lib/env-write.mjs` |
| `curl`, `wget` | not guaranteed, and flags differ | `fetch()` — Node has it built in |
| `openssl` | not everywhere, LibreSSL on macOS | `node:crypto` |
| `date +%s%N`, `readlink -f`, `realpath` | GNU-only flags | Node (`Date.now()`, `path.resolve`) |
| `split("\n")` on a file from disk | on Windows every line ends on `\r` | `split(/\r?\n/)` — see **Line endings** below |

**The rule of thumb that settles most cases: anything that starts, stops or
finds a process belongs in a `.mjs` script, not in bash.** Node is guaranteed
present — it is a Next.js app — and `child_process.spawn`, `process.kill` and
`fs` behave the same on all three systems, while every shell tool above does not.

**Exactly one exception — the question the rule cannot answer: is there a Node
here at all?** The `SessionStart` guard in `.claude/settings.json` asks it in
shell, because a Node program that is not there cannot report its own absence
(see **First: meet the user where they are**). It is written
`if ! command -v node …; then echo …; fi` — not `||` — on purpose: a shell that
does not understand it prints **nothing**, where `||` would print a false
warning. Silence is the safe failure here; a false alarm is not.

**Ask the thing, not the process table.** Whether a service is alive is answered
by a TCP connect or an HTTP GET, never by hunting in `ps` — portable by
construction, survives a recycled PID, answers "does it respond?" instead of a
proxy for it. `scripts/dev/ports.mjs` is written that way.

Two spawn rules, both written out at the top of `run.mjs`:

- **Spawning `npm` needs a shell** — it is a `.cmd` shim on Windows, and Node
  refuses those without one since 18.20/20.12 (`EINVAL`). Our own scripts start
  as `spawn(process.execPath, ["scripts/…mjs", …args])` — no shell, so user
  arguments cannot be mangled; `docker`, `git`, `cloudflared` need neither.
- **Never pass a `shell` option yourself — that decision belongs to
  `scripts/lib/proc.mjs`**, and `scripts/portability.test.ts` fails the build on
  a second one: `shell: true` beside an args array escapes nothing (Node 24's
  `DEP0190`); `spawnCommand()` starts `cmd.exe` only where the resolved file
  really is a `.cmd`/`.bat`, with every argument quoted, and `openUrl()` lives
  there too — opening a URL is the one case with no way around a shell.

### Line endings — LF, on all three systems

Git for Windows defaults to `core.autocrlf=true` and checks text files out with
**CRLF**, which used to break two things silently. Every `.env` key read back
"not set" — a `$`-anchored pattern never matches a line ending in `\r` — so a
fresh `AUTH_SECRET` was minted on every run, signing everybody out. And
`node run.mjs update` did nothing, for ever: the `.template-version` hashes are
taken over LF content, so every guidance file looked "edited in this app".

**`.gitattributes` decides this, not the machine's git config** — one line,
`* text=auto eol=lf`, and all three systems see the same bytes.
`scripts/portability.test.ts` asserts it is there and that no file in the
project carries `\r\n`.

Two rules follow for anything you write:

- **Split a file on `/\r?\n/`, never on `"\n"`.** The `.env` matters most — it
  is gitignored, so `.gitattributes` never sees it; go through `setEnvValue()` /
  `readEnvValue()` (`scripts/lib/env-write.mjs`, `scripts/lib/env.mjs`) rather
  than parsing `.env` again somewhere else.
- **Normalise before hashing** — `normalizeText()` from
  `scripts/dev/update-plan.mjs`; on Windows it is the difference between an
  update that works and one that silently refuses.

`scripts/portability.test.ts` also scans `run.mjs` and `scripts/` for the tools
in the table above and fails the run when one shows up — it is the reason this
does not quietly rot back into a Linux-only project; don't switch it off.

## What the app stores about people

`docs/data-protection.md` is the inventory: every table holding personal data,
what reaches Digistore24 / the mail provider / the host, what is pruned and
after how long. `compliance-check` drafts the privacy policy from it. **Keep it
current when you add a table** — a privacy policy is only as true as the list
it was written from.

Three things in it that are easy to get wrong:

- **Sign-in security processes IP addresses** — in memory, fifteen minutes,
  never stored; processing without storing is still processing.
- **Operator notes (`grants.note`, `token_ledger.note`) are personal data** —
  hidden from the customer as a matter of tone, not exempt from a subject
  access request.
- **Orders are not deletable on request** while the statutory retention runs —
  they are accounting records, and deleting one would be the violation.

**An access request is one command:** `node run.mjs data-export --email …`
produces everything held about one person as JSON. It searches by **address, not
by account** — the people most likely to ask are the ones who never got one. Do
not "tidy" it into a member-scoped export, and do not strip the operator notes
from it.

**There is a second export, and the two must not drift.** The member downloads
their own copy from `/dashboard/account` (`lib/privacy/export.ts` →
`app/api/account/export/route.ts`); it differs from the command in exactly one
documented way — the raw Digistore24 webhook bodies are not in it, because they
can carry a third party's data (Art. 15(4)). `lib/privacy/export.test.ts`
compares the two section by section and fails the build when one grows a table
the other lacks.

## Which EU rules reach this app

**[`docs/compliance.md`](docs/compliance.md) is the map** — which regulation
applies from when, who is exempt, and what in *this* app triggers it. The skill
that walks it is `compliance-check`; `node run.mjs legal-check` reports what is
still missing. Four rules before you touch any of it:

- **The AI disclosure is law, not copy** (Art. 50(1) EU AI Act, applicable since
  2 August 2026). The rule is not "the chat carries a notice" — it is a rule
  about a LIST of surfaces: `DISCLOSURE_SURFACES` in `lib/ai/disclosure.mjs`
  (the assistant and a companion). Each mounts `<AiDisclosure surface="…" />`
  above its transcript, **unconditionally**; a companion owes it earlier and
  says more — a model **reads what you write**. `lib/ai/disclosure.test.ts` and
  `node run.mjs legal-check` hold it in place, and any AI feature you add next
  MUST join that registry — see **[`docs/compliance.md`](docs/compliance.md)**
  → *§3.3*.
- **This app needs no consent from anybody, and that is the shipped answer** —
  a purchase runs on Art. 6(1)(b), and the only cookies set are the session, the
  language and the theme. **Do not add a cookie banner.** Under § 25 TDDDG a
  banner where nothing touches the device is a defect, not caution.
- **When something DOES need consent** — an analytics tag, a marketing mail —
  declare a purpose in `config/consent.json`, read it through
  `lib/consent/config.ts` (never by re-reading the JSON), and record the answer
  with `recordConsent()`. The table is **append-only** — a withdrawal is a new
  row, never an edit — and `textVersion` is the load-bearing field: bump it when
  the wording changes, and every consent given to the old sentence correctly
  counts as unasked again.
- **Deleting an account does not delete everything, and the dialog says so.**
  `deleteOwnAccount()` takes no id (the session's account, always); orders and
  `ai_usage` keep their rows with the member link `null`, everything else
  cascades. A running subscription **warns and does not block** — refusing
  erasure because it is inconvenient is the violation.

## STOP criteria

For changes to billing logic, signature/auth checks, the export/deletion
of customer data or new external payment/data integrations: first read `guardrails`
and, when in doubt, involve a human.
