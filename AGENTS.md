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
differently.

The difference is not cosmetic. A SAAS app has user accounts, a protected
area behind the sign-in, a data model and a purchase that unlocks
access — carried by IPN events. A landing page, a one-pager, a portfolio or
company site has none of that, and it can't sensibly be billed through
Digistore24 either. Whoever builds that here ends up with a template without a
purpose and billing that runs into the void.

**If the user asks for a plain web page** ("build me a
landing page", "I need a page for my company"), then don't just
start building, and don't silently refuse either: say in one sentence that this
template is meant for sellable SAAS applications, and ask about the product
behind it — what are people supposed to *buy* and what can they *use*
afterwards? Most of the time there is a product idea behind it, and the page was
only ever meant as a sales page. That belongs in the app as the public home page
(`app/page.tsx` + `app/plans/page.tsx`), not as a separate project alongside it.
If it turns out that it really is just a web page without a product, then this
template is the wrong tool — say so openly instead of building something
that won't hold up.

**Trying things out is not the same as building.** Many people start with a
test app — "just show me 'Hello World'", a page with one
button, some small thing to get a feel for the system.
That is expressly fine and **not** a case for the rule above: just build the
small thing, without a confirmation question about the product, without
`market-research`, without a lecture about SAAS. Someone getting to know the
system is not yet building their product.

Two things to keep in mind:

- **Build inside the app**, not next to it — that is, as a page under `app/`, with
  the existing structure. Then the experiment isn't in the way later, it's just
  a page you delete or rebuild.
- **Then build the bridge.** Once it runs, offer in one sentence what the
  next step would be — "should this turn into something you can sell?
  Then I'll start `build-app`". Offer it, don't push. Anyone who wants to keep
  tinkering may do so.

In short: the rule "always SAAS" applies to what the user **builds**, not to
what he **plays** with.

## First: meet the user where they are

The people working here are often **not developers** and don't know what to say
on their first run. Therefore:

**If the app is still unchanged (template state) and the user writes something
unspecific** — "hello", "what can I do here?", "how do I start?",
"let's go" — then **do not answer with a question into the void**, but
greet them briefly, say in one sentence what this template is, and **start the
skill `build-app`**. It is the single entrance and clarifies by itself whether
a product idea already exists (otherwise it hands over to `market-research`).

In short: when in doubt, `build-app`. The user doesn't have to know any skill name —
"Build my app" is enough, and even less than that will do.

**One thing comes before all of that, and it is a hard precondition: does the
machine work?**

> **Before the first file in this project is written or changed, a `node` command
> has answered in this session.** Either the greeting says
> `[Setup: ok — verified <date>]`, or you have run `node run.mjs doctor --json`
> yourself and it came back `"ok": true`. No building before that.

That is not ceremony. A machine without Node lets an entire app come into being
— every page, every table, every test file — and gives way only at the first
command that runs any of it. What the user gets is the failure this template
warns about most loudly: a confident report and a page that never loads. One
second of `doctor` in front of it is the whole cost.

The greeting's line has three states, and the middle one is new:

| | |
|---|---|
| `[Setup: ok — verified <date>]` | the full checklist went through on this machine. Carry on |
| `[Setup: ok — not verified yet]` | nothing obvious is missing, but nobody has looked properly. Run `node run.mjs doctor` before building |
| `[Setup: blocked — …]` | skill **`setup-machine`** first — it installs what is missing and prepares the project |

The same applies when a command fails with "docker: not found", "npm not found"
or "the database does not answer": that is a setup problem, not a bug in the app.

**No greeting at all is the same case, and the most important one to recognise.**
The greeting is printed by `scripts/dev/session-start.mjs`, which is itself
started with `node`. So a machine without Node cannot report that it has no Node;
it simply says nothing, or shows a startup error instead. Your program does not
need Node, git does not need Node, and the app needs it for everything — which
makes "the agent and git installed, Node not yet" the ordinary state of a fresh
clone rather than an exotic one.

Since that absence is the one thing a Node program cannot report, a **second
hook** says it in shell instead — three words asking whether `node` exists, which
is why a machine without one now greets you with `[Setup: blocked — node]` rather
than with silence. **This is the single deliberate exception to "no bash" below**
(see **Three systems**): it starts no process, finds no process, and is the one
check that cannot be written in the language it is checking for. The config files
are JSON and cannot hold the comment, which is why the reason is written here.

**One greeting, four wirings.** The programs this template is built with do not
agree on how a command runs at session start, so the same
`scripts/dev/session-start.mjs` is invoked four different ways. It lives in
`scripts/dev/` and not under any one program's folder for exactly that reason —
it is shared tooling, like everything else in there:

| | |
|---|---|
| Claude Code | `.claude/settings.json` → `hooks.SessionStart` |
| Codex CLI | `.codex/hooks.json`, with `[features] codex_hooks = true` in `.codex/config.toml` |
| Gemini CLI | `.gemini/settings.json` → `hooks.SessionStart` |
| OpenCode | `.opencode/plugins/session-start.js` — it has no declarative hooks, so this one is a module subscribing to `session.created` |

**This app ships wired for all four, and `node run.mjs agent-setup` reduces it to
one.** That order is deliberate: a fresh clone works in whichever program it is
opened in, before anybody has run anything. The command is the tidy-up
afterwards, never a precondition — it removes the wiring for the three that are
not in use, records what it removed in `.agent-profile.json` so `update` does not
put them back, and can restore any of it (`--agent <other>` or `--undo`). It
never touches `.claude/skills/`, the guidance or the greeting: those are shared
by all four. `setup-machine` runs it on the first session; the user does not have
to know it exists.

**And `node run.mjs greet` prints the same thing on demand.** Three of those four
mechanisms are young, and two of them have open bugs where the hook silently
stops firing. The greeting is not decoration — it carries the `[Setup: …]` line
that the precondition above is built on. So if no greeting appeared, do not infer
that everything is fine: run `node run.mjs greet` before you touch a file.

Either way it is `setup-machine`, and its step 0 is written for exactly this: it
reads `scripts/dev/fixes.json` directly, because every command that would have
told it what to do starts with `node`.

**Do not rely on having seen the blocked line, though.** Absence of a signal is
not a signal, and that is what the precondition above is for: run the command.

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

**The skills are the method of this project, not an optional extra.** Each one is
a playbook that already knows the order things have to happen in, the mistakes
that get made here and where to stop and ask. Whichever program you are: when a
task matches one of the descriptions below, **open that file and read it in full
before you act** — do not work from the summary here.

How you find them depends on what you are running in. Claude Code and OpenCode
read `.claude/skills/` directly. Codex and Gemini look in `.agents/skills/`,
where every skill has a short stub carrying the same name and description and
pointing at the real file; the stub is generated, so it can never say something
different. Either way the file you end up reading is the same one.

There are guided skills in `.claude/skills/` — use them in this order:
- **`setup-machine`** — before everything: install what is missing (Node, git)
  and prepare the project (`.env`, dependencies, database, migrations).
- **`market-research`** — when there is no clear idea yet: interview + research
  → target audience, challenges and a concrete product proposal (product brief).
- **`build-app`** — entry point: choose an archetype, create the data model + pages.
- **`setup-digistore`** — set up billing (API key, IPN, checkout).
- **`billing-modes`** — *(optional)* set up subscriptions (monthly/yearly) and/or prepaid
  tokens with auto top-up + subscription self-service (cancel/payment details/invoices).
- **`ai-chat-knowledge`** — *(optional)* switch the in-app assistant on and write
  the handbook she answers from (`content/knowledge/`).
- **`ai-providers`** — *(optional)* choose which AI company the app pays, get the
  key in, bind each task to a model and set the prices the cost page reports.
- **`mcp-server`** — *(optional)* let customers connect Claude to the app: decide
  which capabilities become tools, then switch the MCP interface on.
- **`ux-gateway`** — once the app has pages: the same shape for the experience.
  The first five minutes after a purchase, dead ends, actions that report
  nothing back, hand-built elements, wording, keyboard and small screens —
  measured where it can be (`node run.mjs ux-check`), looked at where it
  cannot, report in `docs/reports/`. The rules it audits against are
  [`docs/ux.md`](docs/ux.md).
- **`security-gateway`** — before the launch: eight checks (access control,
  money, secrets, packages, endpoints, hosting), each finding with a severity,
  the serious ones fixed, and a report in `docs/reports/`.
- **`performance-gateway`** — the same shape for speed: response times, database
  and indexes, ~100 parallel users, memory, CPU, front end — measured against a
  production build, fixed, measured again, report in `docs/reports/`.
- **`compliance-check`** — the EU rules: which ones reach this app, the legal
  pages, the AI Act, consent, data-subject rights and the evidence pack.
- **`setup-hosting`** — the server: pick a host (Railway/Render/Fly.io/
  DigitalOcean), say what it costs, install its CLI, authenticate, create app
  and managed Postgres, set the secrets, wire the migration into the deploy.
- **`go-live`** — put the app online and verify it live (starts with
  `setup-hosting`, then the live Digistore side and a real test purchase).
- **`go-to-market`** — marketing: positioning, channels, launch plan, content
  (landing page, emails, video scripts).
- **`guardrails`** — continuous security rules (money/secrets/customer data).
- **`coach`** — *(any time)* the guide through all of the above: works out from
  the project where it stands, names the next step and starts it — and routes a
  symptom ("Internal Server Error", a purchase that never arrived, the assistant
  answering "I do not know") to the skill that fixes it. Use it whenever the
  user asks what comes next or how to solve something without naming a skill.

The complete path (as simple as possible for the user, every step hands over to the
next one):

**(Setup) Machine** `setup-machine` *(only when something is missing)* →
**(0) Idea** `market-research` → **(1) Build** `build-app` → **(2) Payment**
`setup-digistore` *(→ optional `billing-modes` for subscriptions/prepaid tokens,
optional `ai-chat-knowledge` for the in-app assistant, optional `ai-providers`
to choose the AI company, optional `mcp-server` for the AI interface)* →
**(3) Experience** `ux-gateway` → **(4) Security** `security-gateway` →
**(5) Scaling** `performance-gateway` → **(6) Legal** `compliance-check` →
**(7) Live** `go-live` *(which begins with `setup-hosting` — host, database,
secrets, domain)* → **(8) Marketing** `go-to-market`. Alongside all of it:
`guardrails`, and `coach` whenever somebody has lost the thread.

**Experience comes before security on purpose.** Its findings change the
interface, and a security pass run before those changes is a pass on an app that
no longer exists. It also comes after the payment step rather than before it,
because the moment it exists to protect — a customer who has just paid, looking
for proof that it worked — is not there to be checked until there is a
checkout.

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
  - A skill that **builds** something is a numbered path: `Step 0` asks whether
    the thing is wanted or already there, then `Step 1`, `Step 2`… in order.
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
- **End by naming the next skill and offering to start it.** A skill that stops
  with "you could now…" leaves the user exactly where they were.

## Rules

- **Sign-in is not optional for app pages — but it is not automatic either.**
  Protection is **opt-in, not opt-out**: `proxy.ts` guards only what its
  `matcher` lists — today `/dashboard/:path*` — and `auth.config.ts` returns
  true for every other path. **Any new route outside `/dashboard` is public
  until you add it to the matcher.**
  Public by design: the home page, `/login`, `/plans`, `/optin/*`,
  `/account/confirm-email`, the IPN endpoint `/api/ipn` (secured via the
  SHA512 signature) and the MCP endpoint `/api/mcp` (secured by a per-member
  bearer key — it has no session and cannot have one).
  **`/account/confirm-email` is public deliberately and must stay that way** —
  it is authenticated by its single-use token, and the mail carrying it is read
  on whichever device holds the inbox, which is routinely not the one signed in.
  Adding it to the matcher would break the feature for exactly the person it
  exists for. `/plans` is public on purpose — a visitor can buy without signing
  in, and the purchase is attached to their account the first time they do.
- **IPN signature verification (SHA512) is mandatory.** Never switch off
  `lib/digistore/ipn.ts`. Set order status only through IPN events.
- **Access comes from the entitlement API.** What a Member may use is answered
  by `hasPlan()` / `entitlementsFor()` (`lib/entitlements/manage.ts`) — never by
  reading a billing table. See **Access** further down; the full reference with
  examples is `docs/entitlements.md`.
- **No secrets in the code.** Read from `process.env`, add new variables to
  `.env.example`. The operator's Digistore24 credentials live in
  the environment (`.env`, in STAGING/PROD in the hoster's secret management) and
  are read via `lib/digistore/settings.ts` — not from the database.
- **No mock/demo fallback** on Digistore API errors — throw errors.
- **Database changes only via migration.** Change the schema in `db/schema.ts`,
  then `node run.mjs db-generate` → `node run.mjs db-migrate`; the file in `drizzle/` is
  checked in and never edited again after it has been applied. `db:push` only against an
  empty local DB, never against staging/production. See `docs/database.md`.
- **A type on a query is a claim, and raw SQL does not keep it.** Drizzle
  converts a *column* (`grants.createdAt` arrives as a `Date`); a raw
  ``sql`…` `` expression is handed on exactly as the driver returned it, so
  ``sql<Date>`min(created_at)` `` is a string wearing a `Date`'s clothes.
  `db/sql-cast.test.ts` fails on it. The full trap, including why
  `new Date(value)` is the wrong way out, is in **Dates and raw SQL** below.
- **Environments are binding: DEV / STAGING / PROD** (`APP_ENV`). In
  STAGING and PROD, mail delivery is **mandatory** — if it is missing, the app
  does not start (`instrumentation.ts` → `lib/env-guard.ts`). The development
  sign-in (`lib/auth/dev-login.ts`, sign-in without a magic link) applies
  **exclusively** in DEV, only on localhost and only as long as no mail delivery
  is configured. Never soften these conditions — it is an auth bypass. Unknown
  `APP_ENV` values are deliberately treated as "production".
- **Use the design system — don't rebuild anything yourself.** The UI consists
  of shadcn/ui components (`components/ui/`) and the tokens from
  `app/globals.css`. Don't write raw `<button>`, `<input>`, `<select>` or
  `<table>` any more, no hand-picked color classes. What's missing gets fetched:
  `npx shadcn@latest add <component>`. See **UI** further down.
- **All visible text goes through i18n.** No German (or English) sentence
  hard-coded — every text lives in `messages/de.json` **and**
  `messages/en.json`. See **Languages** further down.
- **Messages always as a `Callout`.** Notices, success, warning and
  error messages go through `components/ui/callout.tsx` with one of the four
  intents `info` | `success` | `warning` | `danger` — **never** with hand-picked
  color classes (`text-amber-900`, `bg-red-50`, …). The token pairs
  behind them are checked for readability in light **and** dark; your own
  combinations regularly tip over into the unreadable in whichever mode you
  weren't looking at. For status *inside* running text there are
  `text-success-foreground` & `text-danger-foreground`.

  ```tsx
  <Callout variant="warning" title={t("noMailTitle")}>{t("noMailBody")}</Callout>
  ```

  For the short feedback *after* an action ("saved", "deleted")
  there are toasts instead — see **UI**, where all three feedback mechanisms
  are laid out side by side. Rule of thumb: what has to stay on screen is a
  `Callout`; what may drift past is a toast — including across a `redirect()`,
  which is the case people forget.
- **Light and dark both count.** The app ships with a toggle
  (system/light/dark, `components/theme-toggle.tsx`); `System` is the
  default. Every new piece of UI has to be readable in both modes — that follows
  by itself as long as colors come from the tokens. `dark:` classes follow
  the `.dark` class on `<html>` (`@custom-variant` in `app/globals.css`).
- **Tests are mandatory.** Every feature gets `vitest` tests (blueprints in
  `lib/digistore/*.test.ts`); `npm run test` and `npm run typecheck` must be green
  before anything moves on. They run **locally** — `node run.mjs test` does both
  in one go. Nothing runs them for you after a push, so a red test that gets
  committed stays red until somebody looks.
- **Call up the app yourself before you say "done", then ask the log.** See
  below — green tests are no proof that the page loads, and a page that loads is
  no proof that it rendered. `node run.mjs errors` is the second half of that
  sentence.
- **Linux, macOS and Windows all count.** The programs this app is built with
  run on all three — so every command in `run.mjs` and every
  script under `scripts/` has to work on all three. Not "mostly": a developer on
  Windows who cannot start the app has no way around it. Details, and the
  reasoning, in **Three systems** further down.

## UI

The app ships with a finished design system. **There is nothing to
design here — there is something to use.** Whoever builds their own buttons, tables or
colors doesn't make the app more individual, only inconsistent: the
hand-built variant tips over in dark mode, has no focus ring and looks
different again two pages later.

**This section says which component to reach for.
[`docs/ux.md`](docs/ux.md) says what the app has to do for the person in front
of it** — the first five minutes after a purchase, dead ends, wording, keyboard
and small screens. The skill that audits an app against it is `ux-gateway`, and
`node run.mjs ux-check` settles the part of it a machine can settle.

**The construction kit** (`components/ui/`, all shadcn/ui):

| For what | Use | Instead of |
|---|---|---|
| Button, link-as-button | `<Button>` (`asChild` for `<Link>`) | `<button className="…">` |
| Input field, label | `<Input>`, `<Label>`, `<Textarea>` | raw `<input>` |
| Selection | `<Select>` (with `name` for the form) | raw `<select>` |
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
   without feedback feels like an error to the user, and the place feedback
   silently goes missing is the page boundary: the code that knows something
   succeeded ends by sending the person somewhere else, and the page they land
   on says nothing. There are **three** mechanisms, and between them they cover
   every case — pick by *where the result has to appear*, never invent a fourth:

   | The result… | Use | Where |
   |---|---|---|
   | has to **stay** on screen (a state, a warning, a prerequisite) | `<Callout variant=…>` | `components/ui/callout.tsx` |
   | comes from a **server action on the same page** | `useActionToast(state)` | `hooks/use-action-toast.ts` |
   | belongs to something that ended in a **`redirect()`** | `<FlashToast>` | `components/flash-toast.tsx` |

   Server Actions return `{ error, ok }`; the page calls `useActionToast(state)`
   and gets success in green, errors in red.

   `<FlashToast>` fires once and then strips its query parameter, so a reload
   does not repeat the message. **The message never travels in the URL** — the
   parameter carries a *reference* (an id), and the receiving page looks it up
   and decides what to say, scoped to whoever is signed in. A URL carrying the
   sentence itself is a URL anybody can hand somebody else to make your app say
   whatever they typed. The worked example is the purchase:
   `app/optin/[orderId]/page.tsx` redirects to `/dashboard?purchase=<id>`, and
   `app/dashboard/page.tsx` resolves it through
   `purchaseNoticeFor(memberId, id)` before naming the plan that was unlocked or
   the tokens that were credited.
2. **Everything destructive asks first.** Deleting, cancelling, resetting run
   through `<AlertDialog>` and name *what* gets hit while doing so
   ("delete customer@example.com?"). The confirm button is red
   (`variant="destructive"`), never in the accent color.
3. **Every new page goes into the shell.** Protected pages live under
   `app/dashboard/…` and inherit sidebar and header automatically from
   `app/dashboard/layout.tsx`. It gets into the navigation with one line in
   `NAVIGATION` (`components/app-shell.tsx`) — plus the text in both
   language files.
4. **Both modes, always.** Colors come from tokens (`bg-card`,
   `text-muted-foreground`, `bg-primary`), never from Tailwind palettes
   (`bg-blue-600`, `text-gray-500`). Then light and dark work out by themselves.

**Recoloring** (the whole look): `--primary`, `--primary-foreground`
and `--ring` in `app/globals.css` — in **both** blocks (`:root` and
`.dark`). Nothing more is needed. The file explains what to watch out for.

**The app icon** (browser tab, bookmark, home screen) is `app/icon.png` plus
`app/apple-icon.png`. Next.js picks both up by their file name — there is no
`<link rel="icon">` to write and nothing to register. What ships here is the
DS24 AppKit icon, i.e. a placeholder: **replace both files with your own logo**
(square PNG, same names, `icon.png` around 256×256, `apple-icon.png` 180×180)
and the tab carries your brand. The name next to it comes from `APP_NAME`
(`lib/app.ts` / `NEXT_PUBLIC_APP_NAME`), not from these files.

**Blueprint page:** `app/dashboard/admin/users/` — table, create dialog,
row menu, delete confirmation, toasts and translation in one piece. Whoever builds an
admin page looks there first.

## Languages

The app is bilingual (German, English) — **without a language prefix in the
URL**. The language comes from a cookie (toggle in the sidebar) and
on the first visit from the browser. It is wired up in `i18n/`, the texts
live in `messages/de.json` and `messages/en.json`.

**The rule: no visible text in the code.** Every sentence, every label,
every placeholder, every error message belongs in *both* language files.
Identifiers in the code, by contrast, are **English** (`createUserAction`, `isActive`,
`emailPlaceholder`) — the user never sees them.

```tsx
// Server component
const t = await getTranslations("users");
<h1>{t("title")}</h1>

// Client component
const t = useTranslations("users");
<Button>{t("createSubmit")}</Button>

// With values and plurals
t("created", { email: user.email })
t("description", { count: users.length, email: session.user.email })

// Text with markup (e.g. <code>) — don't stitch it together:
t.rich("hint", { code: (chunks) => <code>{chunks}</code> })
```

**Three things that regularly go wrong here:**

- **Error messages deep in the code.** Rule and database layers return
  *codes*, not sentences (`lib/users/rules.ts` → `"selfDelete"`), and
  only the Server Action translates them (`app/dashboard/admin/users/actions.ts`).
  A sentence that comes into being in `lib/` is always in exactly one language.
- **Date and price.** `useFormatter().dateTime(…)` or
  `formatPrice(def, locale)` — never `toLocaleDateString("de-DE")`. Prices are
  only *written* differently in the process, never converted: what gets billed is
  what is on file at Digistore24.
- **Only one file maintained.** `i18n/messages.test.ts` breaks the build when
  one language is missing a key, a placeholder or an error code. This test is
  the reason why the second language doesn't rot — don't
  switch it off.

**Not translated** (deliberately): product names, plan features and descriptions
from `config/digistore-products.json` — that's your product copy, and at
Digistore24 the same text is on file. Likewise the app name (`lib/app.ts`) and the
terminal output of the scripts in `scripts/`.

**A third language**: create a file in `messages/`, register the code in
`i18n/config.ts` (`LOCALES` + `LOCALE_LABELS`) — done.

## Never ship a broken page

**Before you tell the user that something is done, you call it up yourself.**
Without exception. The most common mistake in this template is an app that the
user opens and that greets them with "Internal Server Error" — while the
agent has reported that everything is done.

That happens because green tests and a successful build do **not**
rule it out. `vitest` checks logic without rendering, `npm run build` checks
compilability without a database and without a real `.env`. A missing
environment value, a query against a column that the migration never created,
an `await` on `params` that was forgotten — all of that compiles
cleanly and blows up only on the first request.

The routine once you have built or changed a page:

```bash
node run.mjs start                # DB + migrations + app
node run.mjs smoke                # calls EVERY page and reports server errors
node run.mjs errors               # what the log picked up — including on a 200
```

`node run.mjs smoke` (`scripts/dev/smoke.mjs`) finds the pages by itself under
`app/` and calls them in **two passes**: first anonymously, then — signed in as
the owner — exactly those that sent it to `/login`. So the pages with the real
queries in them get rendered, not just counted as redirects. It rates them like
this:

- **5xx** → error. Fix it, don't argue it away, don't pass it on as a "known
  issue".
- **307 to `/login` without a session** → correct. Protected pages are supposed
  to redirect, and that answer says nothing about the page — which is what the
  second pass is for.
- **307 to `/login` *with* a session** → error. The session did not take, so the
  page still has not been rendered by anybody.
- **307 anywhere else while signed in** → fine. That is what a `hasPlan()` gate
  looks like from the outside.
- **2xx** → fine.

**The second pass can be unavailable, and then it says so** — one line naming the
reason. It signs in through the development login (`scripts/dev/sign-in.mjs`),
which needs a local app in DEV with no mail transport configured, plus an `owner`
account to sign in as. **Read that line.** "9 protected page(s) NOT checked" is
not a pass, and `--no-signed-in` turns the pass off entirely.

On an error the cause is in the log: `node run.mjs logs`. That's where the real
stack trace is; the page in the browser often shows only the meaningless sentence.

**A 200 is not proof that the page rendered.** This is the trap behind the
routine, and it is worth a paragraph of its own. When `format.dateTime()` gets
something that is not a date, `Intl` throws — but next-intl **catches** it,
writes the error to stderr and renders `String(value)` in its place. The request
answers **200**. The table cell reads `2026-07-25 11:29:17.552095`. The status
code is clean, the build is clean, `vitest` is clean, `smoke` is clean, and the
page is visibly broken. The same goes for a missing translation, a hydration
mismatch, and a promise that rejected with nobody awaiting it.

That is what `node run.mjs errors` is for: it reads `.dev/dev.log`, groups what
it finds by cause, names the file and line, and tells you where the fix belongs.
It exits non-zero when it finds something, so it can gate a "done". `smoke` runs
it around its own sweep; after clicking through the app yourself, run it by hand.

### A hydration mismatch is not always yours

One class of that error comes from **outside the app entirely**, and it is worth
recognising before you go looking for the bug: a browser extension that rewrites
the page before React hydrates. React itself says so at the bottom of its
message — *"It can also happen if the client has a browser extension installed
which messes with the HTML before React loaded"* — and that line is easy to read
past when the stack trace is pointing at one of your own components.

**Read the diff, not the trace.** React prints the attributes that differ, and
they carry the culprit's name:

```
  <svg className="lucide lucide-languages" …>
-   data-darkreader-inline-stroke=""
-   style={{--darkreader-inline-stroke:"currentColor"}}
```

`data-darkreader-*` is Dark Reader, `data-gr-*` and `data-new-gr-c-s-*` are
Grammarly. An attribute nobody in this project wrote, on an element nobody in
this project styled, is an extension. The trace names `components/…tsx` because
that is where the element was rendered, not where the attribute came from — and
the fix is never there.

Three things follow, and the third is the one that costs time:

- **Dark Reader is already dealt with.** `app/layout.tsx` carries
  `other: { "darkreader-lock": "true" }` in its `metadata`, the tag Dark Reader
  documents for exactly this
  ([`CONTRIBUTING.md`](https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md)).
  It is right for this app rather than a workaround: the app **has** a dark mode
  of its own, so an extension inverting it on top is both the fault and a worse
  result than the toggle in the header. A browser without the extension ignores
  an unknown meta name, so it costs nothing anywhere else.
  `app/darkreader-lock.test.ts` keeps the line from being tidied away as
  mysterious.
  **The `"true"` is load-bearing and has nothing to do with Dark Reader**, which
  reads the value never (`meta[name="darkreader-lock"] != null` is its whole
  check): **Next drops an `other` entry whose value is the empty string.** Write
  the `""` that the tag's own documentation suggests and it type-checks, the
  tests stay green, and no tag ever reaches the browser. That is the shape of
  bug this whole section is about — verify a metadata change by looking at the
  delivered HTML, not at the source.
- **It is not a Windows thing**, however it was reported. It follows the browser
  profile, so the same extension shows the same error on Linux and macOS, and a
  colleague without it never reproduces the bug you are chasing.
- **`suppressHydrationWarning` is not the answer, and reaching for it is the
  mistake.** It works **one level deep** — the one on `<html>` covers the theme
  class next-themes sets there and nothing else. Adding a second one further
  down does not stop an extension rewriting the DOM; it stops React telling you
  about it, which is worse than the warning. If some future extension needs
  handling, handle it at the element it touches or not at all.

Three things `node run.mjs smoke` cannot do:

- **Dynamic pages** (`app/…/[id]/page.tsx`) are skipped — without a real ID
  the request is pointless. You call such pages up by hand once with a
  real record.
- **It is signed in as the OWNER, and as nobody else.** So the pages are
  rendered, but always with every right there is. What it therefore cannot see is
  the other half of an access rule: what a `member` gets on an owner-only page,
  what somebody without the plan gets on a gated one, what a blocked account
  gets. Those need a test (`vitest`, on the rule) or your own eyes — a green
  smoke test is not evidence that a gate holds.
- **A green smoke test means "loads", not "is correct".** Whether the content is
  right is something it does not tell you. For everything to do with money, roles
  and customer data, a look at the page itself is part of the job.

## Adding a feature

1. Extend the data model in `db/schema.ts` → `node run.mjs db-generate` (creates a
   migration in `drizzle/`) → check the file → `node run.mjs db-migrate`. The migration
   belongs in the commit. Details: `docs/database.md`.
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
   new page up yourself, signed in, and then ask the log. Only then is it done
   (see "Never ship a broken page").
8. **`node run.mjs ux-check`**, and then look at the page as the customer: does
   it say what to do when it is empty, does the action report back, is it
   readable in dark mode and at 380 px? Thirty seconds each, and they are the
   three that get skipped. The full pass is the skill `ux-gateway`;
   the rules are [`docs/ux.md`](docs/ux.md).
9. **One entry in `docs/app.md`** — the page's path, the access gate as code, the
   tables, the tests. See **This app's own notebook** below.

### This app's own notebook — `docs/app.md`

This file is what CLAUDE.md is not: **CLAUDE.md describes the template, which
every app gets; `docs/app.md` describes THIS app, which nobody else has.** It is
created by the skill `build-app` (step 4b, which holds the shape) and grown by
step 8 above — one entry per feature, written the moment the feature works.

It exists because a session is short and a project is not. Whoever adds the
fifth feature was not there for the first four, and there is no other place to
read them off: the code says what is there but never why, and a git log of
forty commits is not an answer to "what can this app do?". What is not in this
file gets built a second time — a second table beside the first, a second way of
gating the same content, a page that does what one two folders over already did.

Two rules keep it worth reading:

- **Quote the access gate, do not describe it.**
  `hasPlan(memberId, "basis_monatlich")`, never "only for paying customers".
- **Write down what was decided *against*, and why.** The features can be read
  out of the code; the rejected alternative cannot, and it is what gets proposed
  again three sessions later.

The session greeting names any page under `app/dashboard/` that the file does
not mention (`scripts/dev/session-start.mjs`, logic and tests in
`scripts/dev/app-notes.mjs`). It is a hint and not an error — somebody may be
mid-build — but it is the one that decides whether session twenty knows what
session three did.

### Dates and raw SQL

The single sharpest trap in this project, because every part of it looks right.

**Drizzle converts a column. It does not convert raw SQL.** A column reference
runs through the column's own mapper; a ``sql`…` `` expression has no mapper at
all (`noopDecoder`), so the driver's value is passed straight through and the
type parameter is only a note to the compiler. Measured against this database:

```ts
db.select({
  raw: grants.createdAt,                       // → Date                    ✅
  agg: sql<Date>`min(${grants.createdAt})`,     // → "2026-07-25 11:29:17.5" ❌ a string
})
```

Then the string reaches a table cell, `Intl` throws `Invalid time value`,
next-intl catches it and renders the raw string — **200, no test red, page
broken**. `db/sql-cast.test.ts` fails on `sql<…Date…>` so it cannot be committed;
a line that genuinely has to say it is exempted with `sql-cast-ok`.

**Do not "fix" it with `new Date(value)`.** Postgres hands over
`2026-07-25 11:29:17.552095` with no zone marker, so V8 reads it in the *host's*
zone and the timestamp silently moves by the host's offset — the very bug
`db/index.ts` exists to prevent. Instead, one of:

```ts
sql`min(${grants.createdAt})`.mapWith(grants.createdAt)   // borrow the column's mapper
sql<string>`to_char(min(${grants.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
// or: select the column and do the min() in JS
```

Two more ways a `Date` stops being one, both of which keep their type:

- **Through JSON.** `Response.json({ rows })` turns every `Date` into an ISO
  string while the TypeScript type still says `Date`. Anything fetched from
  `app/api/…` needs converting back on arrival — `lib/mcp/tools.ts` calls
  `.toISOString()` on purpose, which is the honest version of the same thing.
- **A nullable column.** `format.dateTime(null)` and `format.dateTime(undefined)`
  do **not** throw and log **nothing**: they render *1 January 1970* and *today*
  respectively. No log check can catch those. Every nullable date needs its
  guard at the call site, the way the rest of the app does it:

  ```tsx
  {row.accessUntil
    ? format.dateTime(row.accessUntil, { dateStyle: "medium", timeZone: "UTC" })
    : tCommon("none")}
  ```

## Users & roles

The `users` table has a `role` field (`db/schema.ts`):
- **`owner`** — SAAS operator (admin). Access to admin areas.
- **`member`** — regular customer (default for self sign-in via magic link, or
  via a password they set on themselves afterwards).

**The first account in a fresh app becomes `owner` by itself** — locally there
is nothing to set up: sign in at `/login` with any address and the admin area
and the "Users" entry in the navigation are there on the first page load. The
role is assigned while the account comes into being (`lib/users/bootstrap.ts`,
wired into `auth.ts` and `lib/auth/dev-login.ts`), not afterwards — the session
is a JWT and carries the role from the moment of sign-in, so a later promotion
would only show up on the next one. **This applies in DEV only**, and that
limit is the point: a freshly deployed PROD instance has an empty user table
too, and the first person to sign in there may be a customer. In STAGING/PROD
the operator creates their account up front with `node run.mjs user-create` (below).

It also carries **`checkoutToken`** — 10 random alphanumerics, issued on the
first checkout by `ensureCheckoutToken()`. It corroborates the member id inside
`tracking[custom]`, so an id alone never identifies a buyer. It is **not** a
credential and never authenticates a session; do not remove it as unused.

`orders` records who bought and what: **`memberId`** (the customer, null while
unattributed), plus `productKey`, `credits` and `ds24PurchaseId`. Those three
are written at payment time and never reconstructed later — the product
registry cannot be reverse-looked-up.

**Securing admin areas:** in server components call `requireOwner()` from
`lib/authz.ts` as the first line (no sign-in → `/login`, no owner →
`/dashboard`). Blueprint: `app/dashboard/admin/page.tsx`. For pure checks there
are `isOwner(role)` / `hasRole(role, [...])`.

**UI:** `/dashboard/admin/users` — create users, switch role,
change email, send a sign-in link, block/unblock, delete. Logic in
`lib/users/manage.ts`, the safety rules (last admin, self-deletion,
self-demotion, self-blocking) as pure functions in
`lib/users/rules.ts` together with tests. **Every** Server Action starts with
`requireOwner()` — Actions are HTTP endpoints of their own and are not
protected by the fact that the page is.

An Operator can change somebody's address here **without a confirmation link**,
and that is right for this page: they are acting on a support call, and a link
sent to the customer's mailbox is one they cannot click. It is exactly wrong as
a self-service mechanism — do not expose `setUserEmail()` to the Member. Their
own path is `lib/email-change/`, and it confirms (see below).

There is no "set a password for this user" here either, and there will not be:
a password the Operator chose is a password the Operator knows.

**The Member's own page is `/dashboard/account`** — balance, plans, and the
sign-in section where they manage their own address and password
(`app/dashboard/account/{page,ui,actions}.tsx`). Its actions start with
`requireActiveUser()`, not `requireOwner()`, and none of them takes a user id
from the form: the account acted on is always the session's own, which is what
makes an IDOR impossible rather than merely unlikely. Build Member-facing
settings there rather than starting a second page.

**A Member changes their own address by proving they can read mail at the new
one** (`lib/email-change/`). That proof is the entire feature — without it the
field would be a one-click account transfer for anybody who finds an unlocked
screen. What holds:

- **Requesting changes nothing.** A row in `email_changes` and a link in the new
  mailbox. Until the link is followed, the old address still signs in, a
  password still works, and an abandoned request stays abandoned for ever.
- **One pending change per Member.** A new request replaces the old one and
  kills its link — that is how a typo'd address is corrected, and why there is
  no cancel button to build.
- **Requests are rate-limited three ways** (`lib/rate-limit.ts`). Two meter the
  *mail*, three an hour: **per account**, so one session cannot hammer the
  button, and **per target address**, so the same mailbox is not reachable again
  from the next account. This is the one action where a signed-in person chooses
  both that mail is sent and who it goes to, and it is the operator's sender
  reputation that pays for leaving it open.
  The third meters the *answer*: refusing an address as already taken (FR-19)
  tells the requester an account exists there, and a refusal sends nothing, so
  neither mail counter charges for it. Twenty an hour per account, counted on
  every request that reaches the lookup. Without it the refusal is an
  enumeration oracle a script can query for free — found by `security-gateway`
  after the feature shipped, which is why it is written down here.
- **Confirming SETS `emailVerified`**, where the Operator's `setUserEmail()`
  clears it. Not an inconsistency to tidy away: there an address is asserted by
  somebody else and has proved nothing; here following the link IS the proof.
- **`/account/confirm-email` is public on purpose.** The mail is read on
  whichever device holds the inbox, which is routinely not the one that made the
  request. The token is the authentication — single-use, expiring, and sent only
  to the address it moves the account to.
- **Confirming claims purchases** made under the new address, the same pass that
  runs at first sign-in. A failed claim never fails the change.
- **The old address is told**, with no link (see above). If the move was not the
  owner's doing, that mail is the only way they find out.
- **Nothing the Member owns moves with it.** Attribution runs on `memberId`, not
  on an address (AD-5), so balance, ledger, grants, role and running
  subscriptions are untouched by a change.

One consequence worth knowing: the session is a JWT, so it keeps the address
from sign-in time. The sidebar shows the old one until the next sign-in. The
account page reads `users.email` from the database for exactly this reason —
being wrong there would be wrong on the page somebody opens to check.

**One Member, whole:** `/dashboard/admin/users/<id>` — reached from the row menu
on the list above. This is the support page: token balance with its ledger
(`listLedgerFor()`), and every entitlement this account has ever held
(`listGrantsFor()`) — live, paused, expired or over, each labelled by
`grantState()` (`lib/entitlements/rules.ts`) and carrying the reason it ended.
Not `entitlementsFor()`: that one is the app's access answer and deliberately
hides the very rows support is asked about.

Three things can be done from the page. All three move money or access, all
three demand a written reason, and all three are worth reading `guardrails`
before you change them:

| Action | What it does | The rule behind it |
|---|---|---|
| **Correct the balance** | books a signed correction (`+100`, `-50`) into the token ledger | `adjustTokens()` (`lib/tokens/account.ts`) → `decideAdjustment()` (`lib/tokens/rules.ts`) |
| **Grant a plan by hand** | hands this account a plan with no payment behind it — a comp, or a purchase that never matched | `grantByHand()` (`lib/entitlements/manage.ts`) → `canGrantByHand()` (`lib/entitlements/grant-rules.ts`) |
| **Revoke a manual grant** | ends one the Operator issued. **Irreversible** | `revokeGrantByHand()` → `canRevokeGrant()` |

**A manual grant is permanent or bounded, and the Operator picks which.** No
date means it runs until somebody revokes it. A date means access ends at the
**end** of that day — `accessUntilFromDay()` stores the last millisecond of it
in UTC, and nothing is scheduled: the term is simply compared against the clock
on every read. Show such a date with `timeZone: "UTC"` (see **Access** below),
or every viewer ahead of UTC reads the following day.

Two refusals to know before you touch any of it, both written as pure functions
rather than left to what the form happens to render — a Server Action is an HTTP
endpoint of its own:

- **A token package cannot be handed out here.** `grantableProducts()` offers
  `kind: "subscription"` and `kind: "one_time"` only; a balance is not an
  entitlement, and `hasPlan()` would answer `false` for such a row for ever.
- **A purchased entitlement cannot be revoked here at all.** Only
  `source: "manual"` rows can, and the refusal lives in the `UPDATE` itself, not
  merely in the menu. Purchased access ends by Digistore24 event — see the table
  under **Access**. Because ending is terminal, the remedy for a revocation made
  in error is a *new* manual grant; that is why two identical ones are legal.

`node run.mjs smoke` cannot see this page — it skips `[id]` routes, and it is not
signed in either. Open it by hand with a real Member id after changing anything
there, then `node run.mjs errors`: this page renders dates and grant states, which
is exactly the material that breaks without changing the status code.

**An Operator can sign in as one of their customers** — the row menu on
`/dashboard/admin/users`, entry "Als Benutzer einloggen". It exists because the
alternative is worse: `setUserEmail()` needs no confirmation link, so without
this feature the way to see what a customer sees is to change their address to
one you control and change it back, which leaves a foreign address on the
account and mails them about a change they never made.

While it runs, **the session IS the member** — `session.user.role` says
`member`, so every `requireOwner()` in the app refuses without a single guard
being modified, including on pages you write later. What you get instead is
`session.user.impersonation`, which is set only during one.

Four properties keep it from being a back door, and all four are load-bearing:

| | |
|---|---|
| **Narrow** | owner → member only. Never another owner (they hold the same rights you do), never a blocked account (`requireActiveUser()` would eject you to `/login` with no way back), never yourself, never chained. `canImpersonate()` in `lib/users/rules.ts` |
| **Visible** | a banner on **every** page, from the root layout — not from `AppShell`, which stops at `/dashboard`. It cannot be dismissed and it names both identities |
| **Bounded** | 30 minutes, then it ends by itself |
| **Recorded** | one row in `impersonations`, written **before** the session changes |

Three things about it are worth knowing before you touch any of it:

- **The record is the authorisation, not a log line.** `/api/auth/session`
  accepts a POST from any signed-in user, and the body reaches the `jwt`
  callback — `@auth/core`'s own types say *"you should validate this data before
  using it"*. So the callback believes nothing in it: it looks the record row up
  by id and rewrites the session only if that row already names the caller as
  its operator. Write the row *after* the swap, or take a member id from the
  payload, and any customer can become any other. `lib/impersonation/session.ts`
  spells it out and `lib/impersonation/guard.test.ts` fails the build on it.
- **The exit action deliberately does NOT call `requireOwner()`**
  (`app/impersonation-actions.ts`). It is the only server action in this app
  that does not, it will read like an oversight, and adding the check would lock
  an Operator inside a customer's account — because by then their session says
  `member`. The guard is `canStopImpersonating()`, and the action takes no id at
  all: the session it ends is always the caller's own.
- **Money stops at the card.** An impersonated session may spend the member's
  token balance, deliberately — but automatic top-up is suppressed
  (`lib/tokens/spend.ts`), because `createBillingOnDemand` charges a stored
  payment method with nobody there to agree to it. A shortfall behaves exactly
  as it would for a real member with an empty balance.

Switch it off entirely with `"enabled": false` in `config/impersonation.json`,
read through `isImpersonationEnabled()` — a malformed file counts as off. Who
signed in as whom is at `/dashboard/admin/impersonations`, appears in
`node run.mjs data-export`, and is kept for 12 months
(`docs/data-protection.md` §12). What was *done* while inside is deliberately
not recorded anywhere.

**Blocking** (`users.blockedAt`) takes effect in two places — both are needed, see
`lib/users/blocked.ts`:

1. **No new sign-in** — `signIn` callback in `auth.ts`.
2. **End of the running session** — `requireActiveUser()` from `lib/authz.ts`,
   called in `app/dashboard/layout.tsx`. Without this second step a
   blocked user would stay in until their JWT expires: sessions are JWTs,
   and what's in them is the state at the moment of sign-in. The proxy does not
   check that — it sees only the JWT and is kept free of the database.

Blocked users land on `/login` with `?error=AccessDenied` and see the
message "Account blocked" there — the same path Auth.js takes on every rejected
sign-in (`pages.error` in `auth.config.ts`).

**Passwords are optional.** Signing in happens via magic link by default, and
that stays the default — it is the safer credential, because there is nothing
to leak, reuse or phish. On top of it every Member may set a password on
themselves, on their own account page (`/dashboard/account`): it saves the trip
through the inbox, it works on a machine where their mail is not open, and it is
theirs to add or remove at any time. Nobody is required to have one, and an
account without one behaves exactly as it always did.

**`/login` is ONE dialog with two steps** — the address first, then whatever
that address needs to prove. The branch is a pure function,
`routeForSignIn()` in `lib/auth/sign-in-route.ts`: a password if the address has
one, otherwise a mailed link, otherwise (demo mode only) straight in. Two things
about it are load-bearing:

- **The password is asked for FIRST, before demo mode is considered.** Leading
  with `if (demoLogin)` reads better and silently makes every password set on a
  demo machine unusable. Demo mode is a property of the installation; a password
  is a thing its owner set on themselves.
- **The dialog answers "does this address have a password?" to anyone who
  types one.** That is an accepted cost, not an oversight, and it is metered
  (`LOOKUP_LIMIT` in `lib/credentials/rules.ts`). It never answers whether an
  *account* exists — an unknown address takes the same branch as a passwordless
  one, and it has to keep doing so.

The pieces, if you touch this:

| | |
|---|---|
| `lib/credentials/rules.ts` | pure rules — minimum length, no composition rules, and the sliding-window limit on failed attempts |
| `lib/credentials/hash.ts` | scrypt from `node:crypto`. The **only** file that writes or reads `users.passwordHash` |
| `lib/credentials/manage.ts` | the shell: set, remove, and the sign-in check. Acts only on the account whose id the caller read from the session |
| `lib/auth/password-login.ts` | the Auth.js Credentials provider, id `"password"` |
| `lib/email.ts` | `sendCredentialChangeEmail()` — the notice below |

Three rules that are load-bearing rather than stylistic:

- **A password never replaces the magic link, and is never the only way in.**
  That is what makes the next point safe.
- **There is no password reset, and none is missing.** Whoever forgets their
  password signs in with a link exactly as before and sets a new one. A reset
  mail would be a second recovery channel with identical security properties.
  The Operator's menu entry **send sign-in link** is the same thing from the
  other side — it runs through `signIn()` from Auth.js, so the same token
  mechanism applies as with a normal sign-in.
  ⚠️ Since `/login` became a two-step dialog, that recovery path hangs on ONE
  button: **"send me a link instead"**, on step 2 beside the password field
  (`app/login/ui.tsx`). An address with a password is routed to the password
  field and nowhere else, so deleting that button as redundant would leave
  everybody who forgot theirs with no way in at all.
- **Failed password attempts are rate-limited** (`lib/rate-limit.ts`), and that
  limit is not optional. A magic link is protected by the attacker having to
  read somebody else's mail; a password is protected by nothing but the number
  of guesses it allows. Removing it would make this app less safe than it was
  before passwords existed. Two counters: **ten per quarter hour per address**,
  and **thirty per quarter hour per origin** — the second catches one password
  sprayed across many accounts, which the first cannot see because it only ever
  gets one hit per address. The origin is `x-forwarded-for`, so it only engages
  behind a proxy; that is every hoster this template targets, and where there is
  none the limit withholds nothing it would otherwise have granted.

The password sign-in is refused for blocked accounts like every other provider,
and it is checked **twice** — in `verifyPasswordLogin()` and again in the
`signIn` callback in `auth.ts`. That redundancy is deliberate; do not tidy it
away.

**Every credential change mails the Member.** Setting, changing or removing a
password sends a notice to the account address, and it is the only defence
against the case nothing else covers: somebody reaches an unlocked machine,
opens the account page and sets a password on themselves. They walk away with a
credential that outlives the borrowed session, and without the notice the owner
never finds out.

Three rules about that mail, all load-bearing:

- **It carries no link, and must not grow one.** Not a "wasn't me" button, not
  a revoke link, not a sign-in link. A security notice that acts on a click is a
  phishing template with your sender address on it; one that cannot act is
  useless to forge, which is what makes it safe to send to an account that may
  already be in the wrong hands. `lib/email.test.ts` asserts this.
- **A failed send never undoes the change.** The password is already written
  when the notice goes out, so `notify()` in `app/dashboard/account/actions.ts`
  swallows every error into a log line. Telling the Member it failed would be a
  lie that also loses their change. A machine with no mail transport configured
  is a normal state here, not an error.
- **The subject names which change it was.** It is what somebody reads in a list
  of unopened mail, and "a password was created" is alarming to a person who
  created none, where a generic "something changed" is not.

This is the second mail the app sends, and the opposite shape from the first:
`sendLoginEmail()` is nothing but a link, this one must contain none. That is
why `lib/email.ts` composes a `Mail` and hands it to one transport, rather than
every send function taking a `url`.

> Role helpers (`roleLabel`, `isRole`, `ROLES`) live in `lib/roles.ts`, not in
> `lib/authz.ts`. Client components must import from `lib/roles.ts` — `lib/authz.ts`
> hangs off `auth.ts` and would drag mail delivery into the browser bundle.

**Creating an account / setting a role via CLI** (idempotent upsert by email; the
operator then simply signs in via magic link as usual):

```bash
node run.mjs user-create --email owner@example.com --role owner --apply
node run.mjs user-list                       # or: … user-list --role owner
# direct: node scripts/users/create-user.mjs --email … --role owner --apply
```

Dry run is the default; only `--apply` writes. Details: `scripts/users/README.md`.

## Access — what a Member may use

Two functions, both in `lib/entitlements/manage.ts`, and nothing else:

```ts
import { hasPlan, entitlementsFor } from "@/lib/entitlements/manage";

// One feature, one plan — this is the check. The key is a `kind: "subscription"`
// or `"one_time"` entry from config/digistore-products.json; a token package is
// a BALANCE, not an entitlement, and always answers false here.
if (await hasPlan(memberId, "basis_monatlich")) { /* show it */ }

// Everything at once, for a list or a badge.
const owned = await entitlementsFor(memberId); // [{ productKey, source, accessUntil }]
```

`accessUntil` is `null` for every purchase (that access ends by event, not by a
date) and for a permanent manual grant. Render it with an explicit
`timeZone: "UTC"` — it is stored as the last millisecond of the day, so without
the pin every viewer ahead of UTC reads the next day — and give `null` a real
sentence ("no end date"), never a blank cell. The Member's own page,
`app/dashboard/account/page.tsx`, is the worked example.

They read `grants` — the app's own answer to "may this person use this". They do
**not** read `orders` (a financial record) and **not** `subscriptions` (a mirror
of what Digistore24 believes), because those carry values that mean the opposite
of what access should do: a cancelled subscription reads `cancelled` while the
customer still legitimately has access to the end of the period they paid for.

The IPN maintains the grants, and the **event** decides — nothing else does:

| Event | What it does to access |
|---|---|
| `on_payment`, `on_payment_subscription_signup` | grants it (and lifts a suspension) |
| `on_refund`, `on_chargeback` | ends it, for good |
| `on_payment_missed` | suspends it — reversible; a fixed card brings it back |
| `last_paid_day` | ends it. This is how purchased access normally expires |
| `on_rebill_cancelled` | **nothing at all.** Billing stops, access runs on |

**A Member can hold two plans at once.** A Digistore24 plan switch stops the old
rebilling and starts a new purchase; the two events arrive days apart, in either
order. So during an upgrade a Member holds both keys — or, briefly, neither.
Ask `hasPlan` per feature. `entitlements[0]` is not "the plan", and an app that
renders it as one shows the wrong plan to every upgrading customer.

**A missed payment makes the plan disappear from both answers** — which reads to
the customer exactly like an account closure, and is not one. For the *message*
only, there is `suspendedKeysFor(memberId)` plus `pausedKeys(owned, suspended)`
(`lib/entitlements/rules.ts`): Product Keys, no operator note, and nothing that
decides anything. Say "your access is paused", never nothing at all.

Failure modes, the token balance and worked examples: **`docs/entitlements.md`**.

### Charging tokens — `spendTokens`

A balance is **not** an entitlement. `hasPlan()` answers `false` for a token
package for ever, and that is correct: a plan is a right, a balance is a
quantity. Metering usage is the other question, and it has one answer:

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
then fails. Doing the work with no check in front gives the result away for
free, because by the time `spendTokens` throws, the expensive part has already
run — and that is the mistake that actually gets made. The gap between the check
and the charge is real but bounded at one operation, and the row lock still
stops a balance going negative; closing it properly means reserving up front,
which this template deliberately does not do.

Four more rules, and the first is the one this function exists for:

- **It takes no member id — never give it one.** The account charged is always
  the session's own (`requireActiveUser()`, which also turns away blocked
  accounts). `consumeTokens({ memberId, … })` is the primitive underneath and
  belongs to the IPN and the Operator pages, where naming somebody else is the
  job. A Server Action is an HTTP endpoint of its own, so `memberId` taken from
  a `FormData` is an IDOR that drains another customer's balance — and an
  optional parameter defaulting to the session does not close it, it only makes
  the bad call compile again. Charging on behalf of somebody else needs its own
  function, opening with `requireOwner()`, exactly as `adjustTokens` does.
- **The price is yours, computed in code.** Read `amount` from the request and
  the customer sets it to 0.
- **`note` is a label, not content.** It reaches a subject access request
  (`node run.mjs data-export`, `docs/data-protection.md`). "report generation",
  never what the Member typed.
- **It is not idempotent.** Two submissions charge twice — there is no key to
  deduplicate on. Keep a double-click off with `disabled={isPending}`, and never
  build a blind retry around it.

A shortfall throws `TokenError("insufficientBalance")` and writes **nothing** —
no balance change, no ledger row. Concurrency is already handled: `consumeTokens`
holds a row lock, so racing requests cannot drive a balance below zero.

Spending is never gated on `billingMode` — that switch is cosmetic, and refusing
to spend would strand customers still holding a paid balance.

## The AI assistant

Optional, off until switched on, and it has its own guide:
**[`docs/ai-chat.md`](docs/ai-chat.md)**. The skill that writes her handbook is
`ai-chat-knowledge`. Four things are worth knowing before you touch any of it:

- **Two switches, both required.** `"enabled"` in `config/ai-chat.json` (a
  property of the PRODUCT) and a key for **whichever provider her task resolves
  to** (a property of the MACHINE) — she ships on `"auto"`, so **any one** of
  the five keys does, and `config/ai-models.json` is where you pin a company
  once you have chosen. Read them through `isChatEnabled()` in
  `lib/ai/chat-config.ts`, never by re-reading the JSON, and never by asking
  about one company by name. A malformed config switches her OFF — the opposite
  direction from `billingMode()`, because the failure mode here is a bill.
- **Which model answers is NOT in `config/ai-chat.json`.** That file holds what
  she IS — her name, her handbook, her history window. Which company and which
  model is a property of the TASK, because a second task needs the same
  decision. A leftover `"model"` field there is reported by name rather than
  ignored.
- **She sits on every protected page**, as the button at the bottom right
  (`app/dashboard/chat/launcher.tsx`, rendered by the dashboard layout), and
  once more as her own page under `/dashboard/chat`. Both use the same
  `ChatWindow` with a different `variant` — do not build a second chat
  component for a second place to put her.
- **A feature switched ON that this machine cannot run keeps its menu entry for
  the OPERATOR.** "Switched off" and "not working" are different questions, and
  a `featureKey` that conflates them hides the broken feature *and* the page
  explaining it — an assistant with `"enabled": true` and a key for the wrong
  company then produces no button, no entry and no notice anywhere. The rule is
  `chatNavVisible()` in `lib/ai/rules.ts`; a Member still sees nothing, because
  the diagnosis names an environment variable. Whoever adds the next optional
  feature to `NAVIGATION` decides this again — copy the shape, do not reach for
  `isXEnabled()` alone.
- **She answers only from `content/knowledge/`.** No database, no account data,
  no web. Nothing about the signed-in person is sent to the API — which is why
  she is told she cannot see the account, and why `docs/data-protection.md` §8
  exists. Gate her per plan with `hasPlan(memberId, productKey)` if you want to;
  `requiresPlan: null` means every signed-in member.
- **The whole handbook is sent on every question, as a cached prompt prefix.**
  That is the cheap way round, and it hangs on one rule: *everything that varies
  goes after the last cacheable block* (`lib/ai/prompt.ts`). Put a date, a name
  or an id into the persona and nothing breaks — the cache simply stops hitting
  and the input bill goes up roughly tenfold. `lib/ai/prompt.test.ts` is the
  guard; keep it green.
- **`app/api/chat/route.ts` guards itself.** `proxy.ts` matches `/dashboard`
  only, so everything under `app/api/` is public until it protects itself. It
  uses `currentActiveUser()` from `lib/authz.ts` — the same two checks as
  `requireActiveUser()` without the redirect, because a redirect is a nonsensical
  answer to a `fetch()`.

`node run.mjs kb-check` checks the handbook's format and prints what one answer
costs.

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
and the skill that sets it up is `ai-providers`. Six things are worth knowing
before you write a model call:

- **No call site names a provider, constructs a vendor client or reads an API
  key.** `lib/ai/providers/` is the only place that does, and
  `lib/ai/providers/leak-guard.test.ts` fails the build if that stops being
  true. Reaching for `@anthropic-ai/sdk` directly is the one mistake this whole
  layer exists to prevent — it silently makes one feature ignore the Operator's
  choice of provider.
- **A task is declared in code and bound in configuration.** Add its id to
  `lib/ai/task-rules.mjs` AND to the union in `lib/ai/tasks.ts`; binding it in
  `config/ai-models.json` is optional, because a declared task with no entry
  inherits `default` and works. Adding is cheap; misspelling is a build error.
- **`"auto"` is the shipped binding, and it means "run on whichever key is in
  the `.env`".** That is the property a new app is judged on: one of the five
  keys and the AI works, with no company to choose first. Two rules keep it
  honest and both are load-bearing — a binding that NAMES a company is obeyed
  exactly as written (an honest error beats a quiet substitution onto an API
  somebody else's invoice arrives for), and a `model` or a `providerOptions`
  entry may never sit beside `"auto"`, because both belong to exactly one
  company. `ai-check` refuses that combination rather than letting it work
  until the day a second key appears. New defaults live in
  `PROVIDER_DEFAULT_MODELS` (`lib/ai/providers/ids.mjs`) and **go stale** — a
  retired model id is a 404 on the first question.
- **`system` is a LIST of blocks, and everything stable goes first**, marked
  `cacheable: true`. This is the same rule `lib/ai/prompt.ts` already
  documents, now applying to every task: on three of the five providers a stable
  prefix is worth roughly a tenfold difference in the input bill, and getting it
  wrong produces no error at all. A prompt with a cacheable block *after* a
  varying one is refused outright rather than quietly costing money.
- **Every call is recorded** in `ai_usage` — task, provider, model, tokens,
  latency, outcome, member — and the provider and model are named even on a call
  that never reached a provider. **No prompt and no completion is ever stored
  there**; it is a numbers table, which is what keeps the cost page free of any
  privacy question (`docs/data-protection.md` §10).
- **Recording never fails a call.** It happens after the response, through
  `after()`, and swallows its errors into a log line — the same shape
  `lib/tokens/spend.ts` uses for the auto top-up.
- **What it cost is one page: `/dashboard/admin/ai-costs`** ("KI-Kosten",
  owners only). Spend by task, by model and by day/week/month, always **per
  currency and never summed across two**. It also names what it cannot account
  for — calls with no price on file, failed calls, tokens a provider billed
  without itemising — beside the total rather than inside it. Reads only; the
  aggregations live in `lib/ai/report.ts`, and days are the Operator's days
  (`APP_TIME_ZONE`), not UTC.
- **There is no spend ceiling, deliberately.** A ceiling protects against a
  runaway by taking the app's AI offline for real customers, which for this
  template's operators is the worse failure. A hard stop belongs on the provider
  account. Do not build one here without reading `docs/ai-providers.md` first.

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

## Plans & Digistore products

**One fork comes before every other billing question: whose Digistore24 account
gets paid.** Either the operator of this installation is the only vendor — that
is the default, it is what everything below assumes, and it is fully built — or
the app is a **platform** whose own users connect *their* Digistore24 accounts
and get paid themselves. The second shape is not built here, and it is not a
setting: it turns the API key, the IPN passphrase, the product ids and the order
table into per-tenant things, and it needs a **Developer** API key of your own.
Both shapes, the decision question and the complete build guide for the platform
case are in **[`docs/digistore-integration.md`](docs/digistore-integration.md)**
— read it before designing billing for an app where somebody other than the
operator gets paid. Do not build the platform shape "just in case".

The plan list in `config/digistore-products.json` is the **single source** —
it feeds the plans page (`app/plans/page.tsx`) *and* the sync script. Don't create
a second price list in the code.

**What this app sells is one line in that same file**, and it is the first thing
to set when the vendor tells you which of the two models they want:

```json
{ "billingMode": "subscriptions" | "tokens" | "both", "products": { … } }
```

`"both"` ships as the default and shows everything. The other two turn off the
surfaces of the model that is not used — the token balance on
`/dashboard/account`, the balance/ledger/correction on
`/dashboard/admin/users/<id>`, the "next payment" card on `/dashboard`. Without
it a subscription-only app shows its customers a balance stuck at 0 for ever,
and a token-only app an empty payment card. Read it through
**`lib/billing-mode.ts`** (`sellsPlans()` / `sellsTokens()`), never by
re-reading the JSON.

Four rules go with it, and they are the reason it is safe to flip on a live app:

- **It is COSMETIC. It never decides access.** `hasPlan()`, `entitlementsFor()`,
  `consumeTokens()` and the IPN behave identically in every mode. A display
  setting that revokes what somebody paid for is a refund request, not a layout
  change.
- **A mode may hide an empty thing, never a non-empty one.** Every call site is
  written `!sellsTokens() && balance === 0`, never `!sellsTokens()` alone — so
  an app switched away from tokens still shows the customers who hold some what
  they hold. Write new ones the same way; that is what makes a wrongly set flag
  harmless.
- **The one exception is the manual balance correction.** `adjustTokens()`
  refuses outright in a subscriptions-only app (`TokenError("tokensNotSold")`)
  — it *mints* tokens, and an app that does not sell them carries no endpoint
  that hands them out. The refusal is in the function, not in the form: a server
  action is an HTTP endpoint of its own. To correct a legacy balance, set the
  mode back.
- **Mode and registry must agree.** `lib/billing-mode.test.ts` fails the build
  on a token package declared in a `"subscriptions"` app: `ds24-sync` would
  create it at Digistore24 and it would be buyable, while the app renders
  nothing that credits the buyer. One-directional on purpose — an enabled mode
  with no products yet is the normal state while you are still building.

Deleting the sample products you do not sell is part of setting the mode. Note
that removing one from the JSON does **not** unpublish it: a product `ds24-sync`
has already created stays at Digistore24 until you deactivate it there.

- `node run.mjs ds24-connect` — fetch the API key (browser) and write it into `.env`
- `node run.mjs ds24-sync` — create/update products **and** the IPN
  connection (idempotent): `productId` is written back into the JSON, the
  IPN is registered via the API (only with a public `APP_URL`; skipped locally).
  This one **applies** — a preview without changes is `node run.mjs ds24-sync --dry-run`
- `node run.mjs ds24-approval --apply` — request product approval at the
  reseller/marketplace (`approval_status=pending`). The reseller comes from the
  language (German → Germany/1, otherwise USA/2; overridable via
  `--lang`/`--reseller`/`--siteowner`). A go-live step: only once description and app
  are mature. Before that only **test purchases** are possible — the vendor sets
  the [test-purchase cookie](https://help.digistore24.com/hc/de/articles/23901169396241)

**Digistore24 stores public https URLs only — localhost goes through the
redirect.** Handing it the address the app actually runs on locally ends the
sync on the spot ("*Please only use secure URLs with https://*"). So every such
URL travels as a redirect address that leads back to your machine:

```
http://localhost:3000/optin/[ORDER_ID]
  → https://ds24-appkit.com/redir/?port=3000&path=/optin/[ORDER_ID]
```

That happens by itself — in the scripts (`scripts/ds24/_public-url.mjs`) and in
the checkout at runtime (`lib/digistore/public-url.ts`). The two are twins;
change one, change the other. Never hand a raw localhost URL to the DS24 API,
and don't "fix" it by inventing an https address that nothing answers on.

**The IPN endpoint is the exception.** Digistore24 calls that one *itself*, so
the redirect would land on the Digistore24 server's own localhost. IPN needs a
genuinely public URL — and `ipnSetup` proves it by fetching the address and
insisting on HTTP 200. It even refuses a 301/302, so `/redir/` could not serve
here even if localhost were not in the way.

**`node run.mjs ds24-sync` sorts that out by itself.** When `APP_URL` is local and no
tunnel is running, it opens a free Cloudflare Quick Tunnel (no account, no
domain, no cost), registers that address as the IPN endpoint and says so while
it happens — your machine becomes reachable from the internet for as long as it
runs, and that is not something to discover afterwards. `node run.mjs stop` ends it,
`node run.mjs status` shows it.

Two guards, both deliberate: a **dry run never opens one** (a preview must not
publish your machine), and `--no-tunnel` switches the behaviour off entirely.
A public `APP_URL` never reaches this path at all, so STAGING and PROD are
untouched — there the domain is the right answer and a tunnel would be wrong.

**`node run.mjs ds24-tunnel`** does the same thing on its own, for when you want the
address without touching the products. It runs in the background and returns.

**`node run.mjs stop` closes it, `node run.mjs start` re-opens it** — for an app that already
has an IPN connection (`DIGISTORE_IPN_DOMAIN_ID` in the `.env`); others are left
alone. The address is new on every open, so `node run.mjs start` re-points Digistore24
at it via the stable `domain_id`. Without that step the old, dead address would
stay registered and every purchase would run into the void.

**That `domain_id` has to be unique as well as stable, and `ipnSetup` is the
update too.** Digistore24 finds a connection by (merchant, API key,
`domain_id`) and updates the one it finds — so a generic value (`test-local-1`,
`local-app`) is a collision with the vendor's own other project, and the second
sync silently re-points the first app's IPN at itself. Every id the script
derives therefore ends in a random tail (`local-my-app-diw2hvnz73`); one you
pass with `--domain` is yours to make unique. The connection's `product_ids`
follow the registry for the same reason — one account, several products, and
only some of them this app's. Both, in full:
`docs/digistore-integration.md`.

**"Paid, but nothing happened in the app" has a command, not a theory:**
`node run.mjs ds24-purchase --order ABC12345` asks Digistore24 what it holds for
that order. Unknown id → no purchase (or another vendor account); known there and
missing from `/dashboard/admin/purchases` → no IPN arrived, so the connection is
the suspect. A *rejected* IPN is the other tool, `node run.mjs ds24-ipn-verify`.

`APP_URL` is deliberately left alone: a non-local value there switches off the
development login (`lib/auth/dev-login.ts`), and you would lock yourself out of
your own app. That is also why the tunnel wins over `APP_URL` locally but never
in STAGING/PROD — there `APP_URL` is genuinely public and is the right answer.

**Prices don't belong on the DS24 product.** The API discards `data[amount]`
("*is deprecated — create a payment plan instead*"). Instead `priceCents` and
`billingInterval` go to `createBuyUrl` at checkout as `payment_plan[...]`
(`lib/digistore/checkout.ts` → `lib/digistore/buyUrl.ts`). So in the DS24 UI
**no** payment plans are needed.

Digistore24 *does* have a `createPaymentPlan` API, so a plan per product would
be automatable — we deliberately don't do it. The price would then live in two
places and drift, and a stored plan is fixed: free trials (`test_interval`),
upgrades and downgrades (`upgrade_order_id`), vouchers and per-link affiliate
commissions all only work when the plan travels with the checkout call.
**One price, one place: `config/digistore-products.json`.**

## Local commands

Everything runs through `run.mjs` (`node run.mjs` on its own shows the
overview). Arguments go straight through — there is no `ARGS="…"` wrapping.

- `node run.mjs doctor` — what has to be installed, and what is missing here.
  The first command for anyone whose machine is new to this project.
  `--json` gives the same as data, including the install command for the system
  you are on — that is what the skill `setup-machine` reads.
- `node run.mjs setup` — get the project ready without starting it: `.env`,
  dependencies, database, pending migrations. The one command after a fresh clone.
- `node run.mjs start` — database + migrations + app (http://localhost:3000). Occupied
  ports resolve themselves: the app moves to the next free one (remembered in
  `.dev/port`, all further commands use it), the database likewise — there
  `DB_PORT` and `DATABASE_URL` in `.env` are pulled along. If an instance of
  **this** project is already running on the port, it aborts instead of starting
  a second one. Force it: `node run.mjs start --port 3005`.
- `node run.mjs stop` — stop app + database · `node run.mjs restart` · `node run.mjs logs` · `node run.mjs status`
- `node run.mjs test` — TypeScript check + tests (including the IPN signature verification)
- `node run.mjs smoke` — call every page once; finds "Internal Server Error"
- `node run.mjs errors` — what the log picked up: the errors that leave the status
  code at 200 (a bad date, a missing text, a hydration mismatch). Run it after
  clicking through the app; non-zero exit when it finds something
- `node run.mjs ux-check` — the interface, measured: contrast of every token
  pair in both modes, hard-coded colours, hand-built elements, icon buttons with
  no name, pages that are in no menu. The half of `ux-gateway` a machine can
  settle — a green run means the countable things are counted, not that the app
  is good
- `node run.mjs ai-check` — which task runs on which model, are the keys there, what does a call cost
- `node run.mjs mcp-check` — check the MCP server's settings; `--live` really calls it once
- `node run.mjs db-generate` / `node run.mjs db-migrate` — create / apply a migration
- `node run.mjs db-reset` — clear the local DB, migrate, seed (**locally only**)
- `node run.mjs cron` — the scheduled jobs: run what is due, `--list` them, `--job <id>` to force one
- `node run.mjs db-prune-ai` — delete AI-usage rows older than a year (`--dry-run` first)
- `node run.mjs user-create --email … --role owner --apply` — create an operator/admin account
- `node run.mjs data-export --email …` — everything held about one person, as JSON (subject access request)
- `node run.mjs mail-setup` — set up mail delivery (Postmark or SMTP) + test mail
- `node run.mjs ds24-connect` — fetch the Digistore24 API key and store it in `.env`
- `node run.mjs ds24-purchase --order …` — what Digistore24 holds for one order:
  status, product, buyer, links. The first command when a purchase "did not
  arrive"
- `node run.mjs ds24-tunnel` — public address onto the local app **and** the IPN registered
  on it, so a real purchase reaches your machine (runs in the background;
  `node run.mjs status` shows it, `node run.mjs stop` ends it)
- `node run.mjs build` — production build
- `node run.mjs update` — bring the **guidance** up to date: this file, `docs/`
  and `.claude/skills/`, nothing else. See **This app is a copy** below.

The npm scripts behind them (`npm run dev`, `npm run db:migrate`, …) remain
usable; when in doubt name the `node run.mjs` command, that one is meant for
non-developers — and it is the one that works on all three systems (see **Three
systems**). There is still a `Makefile`, but it only forwards here; never point
the user at `make`, it is missing on Windows.

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
their product on this template. That is a property of the app, not a nice-to-have: a developer on
Windows who cannot start it has no way around it.

**What has to be installed** — the list is deliberately short: **Node.js ≥ 20**
(with npm) and **git**. That is all. **Docker** is used for Postgres where it
exists and is not required where it does not (see below), and **cloudflared** is
only for receiving Digistore24 IPNs on your own machine.

**Of those, a person installs exactly one by hand: git.** Plus the AI program
itself, which is a program of its own and needs no Node. Everything after that —
Node included — is installed *here*, by the agent, through `setup-machine`. That
split is the whole shape of the first run:

```
a person:   the AI program · git · git clone · start it in the folder
the agent:  Node · dependencies · database · migrations · .env
```

It matters because the alternative is a checklist on a web page, and a checklist
is where non-developers stop. Two people can install two tools; nobody should
have to pick the right Node for their chip before they are allowed to begin.

**The per-system install commands are not written down here, and that is on
purpose.** They live in exactly one place — `scripts/dev/fixes.json`, which
`scripts/dev/doctor.mjs` reads — because a list repeated in three documents
drifts, and the copy that drifts is always the one for the system nobody here
runs. `node run.mjs doctor` renders it for the machine you are on; `--json`
hands the same thing to the skill `setup-machine`, which installs it after
asking. So:

- somebody asks what they need → `node run.mjs doctor`
- something is missing → the skill `setup-machine`
- a command needs adding or changing → `scripts/dev/fixes.json`, and nowhere
  else. `scripts/setup.test.ts` fails if an entry loses one of the three
  systems, or if the skill starts carrying install commands of its own.

**Why that table is JSON and not a literal in `doctor.mjs`:** a machine with no
Node cannot run `doctor` at all, and that is precisely the machine that needs
the `node` entry. As data the file can be *read* instead of executed, which is
what `setup-machine` does in its step 0 — so there is still one table, even in
the one situation where nothing runs.

**macOS does not go through Homebrew.** The `darwin` entries name the way that
works on a Mac as it comes, and `darwinFix()` in `doctor.mjs` upgrades them to
`brew install …` at runtime *when brew is already there* — the same move
`linuxFix()` makes for apt/dnf/pacman. Never turn that around. Homebrew is not
preinstalled on macOS, it wants sudo and a long download, and on Apple Silicon
it ends by printing a PATH line the user has to run themselves; a table that
assumes it hands `brew: command not found` to most Mac users at the first step.

Nothing else. In particular **no `make`** — it is missing on Windows entirely
and on macOS until someone installs the Xcode CLT, which is why the commands
run through `node run.mjs <command>` (see **Local commands**). A `Makefile` is
still in the project, but only as an alias for whoever has make; never point the
user at it.

**Docker is used where it is, and replaced where it is not — nobody is asked.**
On Windows Docker means Docker Desktop plus WSL2 plus a restart, and for a
non-developer that is where the product used to end. So the first start looks at
the machine (`scripts/db/driver.mjs`): a Docker that *answers* — the daemon, not
the PATH — gives `DB_DRIVER=docker`, anything else gives `DB_DRIVER=local`, and
then Postgres comes from an npm package (`scripts/db/local.mjs`). Real Postgres
16, same wire protocol, so `DATABASE_URL`, `db/index.ts`, `drizzle/` and every
script stay untouched; what differs is that DEV then deviates from PROD, and
that about 60 MB is downloaded once.

Three properties of that decision are load-bearing:

- **It happens once and is written into `.env`.** "Is there a Docker?" is a
  question whose answer changes between two mornings — a Docker Desktop that did
  not start with the session looks exactly like a machine that never had one.
  Deciding afresh every time would point an existing project at a second, empty
  database, and to the user that reads as "the app forgot everything".
- **Existing data outranks the machine.** A `.dev/pgdata` means this project
  already runs without Docker and keeps doing so, even once Docker turns up.
- **A written-down value is obeyed and never overwritten**, and an unknown one
  throws instead of falling back — `scripts/db/driver.mjs` refuses rather than
  quietly starting the wrong database. `scripts/db/driver.test.ts` holds all of
  this in place.

What follows for you: **never present Docker as a prerequisite**, and never
change `DB_DRIVER` on a project that already holds data. Whoever explicitly
wants the other way round changes the line by hand while the database is still
empty.

**Windows in practice means Git Bash or WSL2.** Git Bash is the narrower of the
two — write for it and both work. Docker Desktop needs WSL2 for the Postgres
container anyway.

The traps are always the same, and they are all in the tooling, never in the app
code:

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
`fs` behave the same on all three systems, while every shell tool above does
not.

**There is exactly one exception in this project, and it is the question the rule
cannot answer: is there a Node here at all?** The `SessionStart` guard in
`.claude/settings.json` asks it in shell, because a Node program that is not
there cannot report its own absence (see **First: meet the user where they are**).
It is written `if ! command -v node …; then echo …; fi` and not with `||` on
purpose: a shell that does not understand it — cmd.exe, if Claude Code ever hands
a hook to one — fails on the syntax and prints **nothing**, where the `||` form
would print the warning to somebody whose Node is fine. Silence is the safe
failure here; a false alarm is not.

**Ask the thing, not the process table.** Whether a service is alive is best
answered by talking to it — a TCP connect, an HTTP GET — not by hunting for it
in `ps`. That is portable by construction, it survives a recycled PID, and it
answers the question you actually care about ("does it respond?") instead of a
proxy for it. `scripts/dev/ports.mjs` is written that way on purpose.

**One Windows-only trap in Node itself:** spawning `npm` needs a shell, because
it is a `.cmd` shim there and Node has refused to run those without one since
18.20/20.12 (it fails with `EINVAL`). Our own scripts are started as
`spawn(process.execPath, ["scripts/…mjs", …args])` — no shell, so user arguments
cannot be mangled by quoting. `docker`, `git` and `cloudflared` are real
executables and need neither. Both rules are written out at the top of `run.mjs`.

**Never pass a `shell` option yourself, though — that decision belongs to
`scripts/lib/proc.mjs` and `scripts/portability.test.ts` fails the build on a
second one.** Not a style rule; it is load-bearing twice over:

- **`shell: true` beside an args array escapes nothing.** Node builds the command
  line as a plain `[file, ...args].join(" ")`, so an argument carrying a `&` or a
  `;` stops being an argument. That is not theoretical — the Digistore24 approval
  link carries query parameters, and `node run.mjs ds24-connect` used to hand the
  browser an address truncated at the first `&`. Node 24 deprecated the
  combination for exactly this reason (`DEP0190`), and the warning it prints
  greets a Windows developer in front of their very first command.
- **Most of those spawns never needed a shell at all.** `spawnCommand()` looks
  the command up on the `PATH` first, and starts `cmd.exe` only where the
  resolved file really is a `.cmd`/`.bat` — with the command line built there and
  every argument quoted, rather than concatenated by Node. Opening a URL is the
  one case with no way around a shell (`start` is a word cmd.exe understands, not
  a program), which is why `openUrl()` lives in that file too.

### Line endings — LF, on all three systems

Git for Windows sets `core.autocrlf=true` by default, so without being told
otherwise it checks every text file out with **CRLF**. That is not a cosmetic
difference here, and it used to break two things without saying a word:

- **the `.env` was unreadable.** A pattern anchored with `$` never matches a
  line ending in `\r`, so every key read back as "not set" — and a fresh
  `AUTH_SECRET` was minted on every run, signing everybody out.
- **`node run.mjs update` did nothing, for ever.** The hashes in
  `.template-version` are taken over LF content, so on a CRLF checkout every
  guidance file looked "edited in this app" and was left alone.

**`.gitattributes` decides this, not the machine's git config.** One line —
`* text=auto eol=lf` — and all three systems see the same bytes. It is a file a
refactor could delete without anybody on Linux noticing, which is why
`scripts/portability.test.ts` asserts both that it is there and that no file in
the project carries `\r\n`.

Two rules follow for anything you write:

- **Split a file on `/\r?\n/`, never on `"\n"`.** The `.env` is the case that
  matters most, because it is gitignored — `.gitattributes` never sees it, and
  it may well have been written by an editor on Windows. `scripts/lib/env.mjs`
  and `scripts/lib/env-write.mjs` normalise on the way in and write LF on the
  way out; go through `setEnvValue()` / `readEnvValue()` rather than parsing
  `.env` again somewhere else.
- **A hash over a file describes its content**, so normalise before hashing —
  `normalizeText()` from `scripts/dev/update-plan.mjs`. On Linux and macOS that
  is a no-op; on Windows it is the difference between an update that works and
  one that silently refuses.

`scripts/portability.test.ts` scans `run.mjs` and `scripts/` for the tools in
the table above and fails the test run if one shows up. It is the reason this
does not quietly rot back into a Linux-only project — don't switch it off.

## What the app stores about people

`docs/data-protection.md` is the inventory: every table holding personal data,
what reaches Digistore24 / the mail provider / the host, what is pruned and
after how long. `compliance-check` drafts the privacy policy from it.

**Keep it current when you add a table.** A privacy policy is only as true as
the list it was written from, and a customer's is written from that file.

Three things in it that are easy to get wrong:

- **Sign-in security processes IP addresses** — in memory, fifteen minutes, to
  stop one password being tried across many accounts. Nothing is stored, and
  processing without storing is still processing.
- **Operator notes are personal data.** `grants.note` and `token_ledger.note`
  hold what the operator wrote *about* a customer. The app never shows them to
  that customer, which is a decision about tone and not an exemption from a
  subject access request.
- **Orders are not deletable on request** while the statutory retention runs —
  they are accounting records. Deleting one would be the violation, not the
  remedy.

**An access request is one command:** `node run.mjs data-export --email …`
produces everything held about one person as JSON. It searches by **address, not
by account**, because the people most likely to ask are the ones who never got
one — a purchase made without signing in leaves their name and address on an
order with no member id. Do not "tidy" it into a member-scoped export, and do
not strip the operator notes from it: hiding those from the customer's own page
is about tone, not about what a legal request covers.

**There is a second export, and the two must not drift.** The member downloads
their own copy from `/dashboard/account`
(`lib/privacy/export.ts` → `app/api/account/export/route.ts`). It differs from
the command in exactly one documented way: the raw Digistore24 webhook bodies
are not in it, because they can carry a third party's data and nobody is in
between to redact them (Art. 15(4)). `lib/privacy/export.test.ts` compares the
two section by section and fails the build when one grows a table the other
lacks — which is the realistic failure, not the difference.

## Which EU rules reach this app

**[`docs/compliance.md`](docs/compliance.md) is the map** — which regulation
applies from when, who is exempt, and what in *this* app triggers it. The skill
that walks it is `compliance-check`; `node run.mjs legal-check` reports what is
still missing. Four things are worth knowing before you touch any of it:

- **The AI disclosure is law, not copy.** Art. 50(1) EU AI Act, applicable since
  2 August 2026: a system that talks to people must say it is a machine, at the
  latest at the first interaction. In this app that is `chat.disclaimer`,
  rendered above the transcript in **both** chat variants, and
  `lib/ai/disclosure.test.ts` fails the build if either language stops naming
  the assistant as an AI. **The rule is not "the chat carries a notice" — it is
  "anything here that talks to a person as a machine says so".** Whatever AI
  feature you add next inherits it.
- **This app needs no consent from anybody, and that is the shipped answer.** A
  purchase runs on Art. 6(1)(b) (a contract, not permission), and the only
  cookies set are the session, the language and the theme. **Do not add a cookie
  banner.** Under § 25 TDDDG a banner where nothing touches the device is a
  defect, not caution: it asks for permission the app neither needs nor uses and
  trains people to click past the one that will matter.
- **When something DOES need consent** — an analytics tag, a marketing mail —
  declare a purpose in `config/consent.json`, read through
  `lib/consent/config.ts` (never by re-reading the JSON), and record the answer
  with `recordConsent()`. It ships with `{"purposes": []}` and writes no rows
  until you do. The table is **append-only**: a withdrawal is a new row, never
  an edit, because a row you overwrote demonstrates nothing and Art. 7(1) asks
  you to demonstrate. `textVersion` is the load-bearing field — bump it when you
  change the wording, and every consent given to the old sentence correctly
  counts as unasked again.
- **Deleting an account does not delete everything, and the dialog says so.**
  `deleteOwnAccount()` takes no id (the session's account, always). Orders and
  `ai_usage` keep their rows with the member link `null`; everything else
  cascades. A running subscription **warns and does not block** — refusing
  erasure because it is inconvenient is the violation, and billing that
  continues at Digistore24 with no account behind it is worth one loud sentence.

## STOP criteria

For changes to billing logic, signature/auth checks, the export/deletion
of customer data or new external payment/data integrations: first read `guardrails`
and, when in doubt, involve a human.
