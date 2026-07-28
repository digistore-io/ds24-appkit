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
without exception").

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
came here to build an app does not want a lecture about Docker; they want the
thing to work.

## Step 0 — The switch: is the idea already there?

This is the **single entrance** of the template. The user doesn't have to know a
second skill — you ask exactly one question first:

> "Do you already have a concrete idea of what your app should do — or shall we
> find one together that fits your experience and your reach?"

- **Idea is there** (the user can say in 1–2 sentences what the app does and for
  whom) → continue with step 1.
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

Ask the user (or work out) what the app is at its core:

| The app should…                                 | Archetype           | What to do |
|-------------------------------------------------|---------------------|----------------|
| Unlock digital content/courses after purchase   | **Content-Access**  | One table per "product"; gate it with `hasPlan(memberId, productKey)` |
| Send recurring messages after purchase          | **Drip/Automation** | Schedule table + a job in `lib/cron/jobs.ts` (`docs/cron.md`), start at `on_payment` |
| Provide a tool/feature for buyers only          | **Gated-Tool**      | Feature pages behind `hasPlan(...)` |
| Manage membership/subscription                  | **Membership**      | `hasPlan(...)` decides access — a cancellation keeps it to the end of the paid period; self-service via `billing-modes` |
| Bill by usage (e.g. AI usage)                   | **Usage/Tokens**    | Prepaid tokens with auto top-up — skill `billing-modes` |

All archetypes use the same base: **auth (`auth.ts`)** for who is signed in, and
the **entitlement API** (`lib/entitlements/manage.ts`) for what they may use.
The Digistore IPN feeds both — it records the payment and maintains the grant
behind it. Reference: `docs/entitlements.md`.

**The archetype answers one more question, so answer it now:** does this app
sell **plans**, **tokens**, or **both**? The last four rows above are plans, the
**Usage/Tokens** row is tokens, and an AI tool with a base subscription is both.
Write it into `config/digistore-products.json` — one line, and you can set it
before a single product exists:

```json
{ "billingMode": "subscriptions" | "tokens" | "both", "products": { … } }
```

The template ships with `"both"`, which shows the surfaces of both models. Leave
it there and a subscription app carries a token balance stuck at 0 on the
customer's account page, and a token app an empty "next payment" card — half an
interface that never fills up, on the pages the vendor looks at first.

It is a **display** setting: `hasPlan()`, `consumeTokens()` and the IPN do not
change, and a mode only ever hides an *empty* card, so nobody loses sight of
something they paid for. Delete the sample products you do not sell from the
same file; `lib/billing-mode.test.ts` fails the build if the two contradict each
other. Reference: `lib/billing-mode.ts`. Everything else about billing is the
`billing-modes` skill.

## Step 2 — Extend the data model

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

- Protected pages under `app/dashboard/…` (already secured via `proxy.ts`).
- **Purchase-dependent content asks the entitlement API**, and it needs a
  signed-in Member:

  ```ts
  import { redirect } from "next/navigation";
  import { auth } from "@/auth";
  import { hasPlan } from "@/lib/entitlements/manage";

  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // A plan key from config/digistore-products.json. A token package is a
  // balance, not an entitlement, and always answers false here.
  if (!(await hasPlan(session.user.id, "basis_monatlich"))) redirect("/plans");
  ```

  A purchase made without an account is attached at the first sign-in, so the
  buyer never has to do anything but sign in. Never answer this from a billing
  table: a cancelled subscription still has access to the end of the paid
  period, so reading the status as "blocked" takes away time somebody paid for.
  Details and failure modes: `docs/entitlements.md`.
- **Usage-metered content charges tokens** — a different question from the one
  above, and a different call. `hasPlan()` asks *may they*, `spendTokens()` asks
  *can they afford this one*:

  ```ts
  import { getTokenAccount, hasSufficientBalance } from "@/lib/tokens/account";
  import { spendTokens } from "@/lib/tokens/spend";
  import { TokenError } from "@/lib/tokens/rules";

  const COST = 5;

  // 1. CHECK — before anything expensive runs.
  const account = await getTokenAccount(session.user.id);
  if (!hasSufficientBalance(account?.balance ?? 0, COST)) {
    return { error: t("insufficientBalance") };
  }

  // 2. WORK
  const report = await buildReport();

  // 3. CHARGE
  try {
    await spendTokens({ amount: COST, note: "report generation" });
  } catch (err) {
    if (err instanceof TokenError) return { error: t(err.code) };
    throw err;
  }
  ```

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

**Two cases still need the CLI**, and neither is this step:

```bash
node run.mjs user-create --email <address> --role owner --apply
```

- **STAGING and PROD**, where the bootstrap deliberately does not fire. That
  belongs to `setup-hosting` / `go-live`, not here.
- **When YOU need a signed-in session and cannot open a browser.** The bootstrap
  fires on a real sign-in, and `node run.mjs smoke` never triggers it:
  `scripts/dev/sign-in.mjs` looks an existing owner up and skips with a named
  reason if there is none, rather than putting a row into somebody's database on
  a command they ran to look at pages. If you need `smoke`'s second pass before
  the user has signed in once, run the command above and say that you did.

Sign-in is by email magic link, and in DEV without mail delivery by the
development login (`lib/auth/dev-login.ts`) — nothing to configure either way.
On top of it every customer may set a password on themselves under
`/dashboard/account`; it is optional and never replaces the link. Protect
admin-only pages with `requireOwner()` (`lib/authz.ts`); model to follow:
`app/dashboard/admin/page.tsx`. Normal customers stay `member` (default).
Details: `scripts/users/README.md` and `docs/auth-setup.md`.

## Step 4 — Write tests AND run them (mandatory)

Write tests for **every** feature and run them — not optional:
- Test **data logic/rules** with `vitest` (models: `lib/digistore/ipn.test.ts`,
  `lib/digistore/buyUrl.test.ts`). Test pure logic without a DB; DB-dependent
  cases against the local Postgres.
- Typical cases: access rules (entitled → feature, not entitled → no feature,
  refunded → gone, cancelled → still there until the paid period ends), input
  validation, edge and error cases.
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

Only then tell the user that they can take a look — and write down what they
will see and at which address.

## Step 4b — Write down what you built (`docs/app.md`)

**Create `docs/app.md` now, with the first feature in it.** This is the app's own
notebook, and the reason it exists is that a session is short and a project is
not: whoever adds the fifth feature was not there for the first four. CLAUDE.md
says what the *template* is; `docs/app.md` says what *this app* is. What is not
in there gets invented a second time — a second table beside the first, a second
way of gating access, a page that does what one two folders over already did.

The shape — keep it, so every entry reads the same:

```markdown
# <App name> — what this app is

_What was built on top of the template. The template's own rules are in
CLAUDE.md; this file is only what came after. One entry per feature, written the
moment the feature works._

## The product

- **Sells:** <what a customer buys>
- **For:** <who>
- **Archetype:** <from step 1>

## Features

### Reports — `/dashboard/reports`

- **Does:** turns a member's entries into a monthly PDF.
- **Access:** `hasPlan(memberId, "basis_monatlich")`
- **Data:** tables `reports`, `report_runs` (`db/schema.ts`)
- **Costs tokens:** 5 per run (`spendTokens`)
- **Tests:** `lib/reports/rules.test.ts`

## Decisions worth remembering

- <what was decided against, and why — this is the part nobody reconstructs>
```

Two rules about it:

- **Access is quoted, not described.** `hasPlan(memberId, "basis_monatlich")`, not
  "only for paying customers". The next session has to be able to read the gate
  off the line without opening the page.
- **The decisions section is the valuable half.** A feature can be read out of
  the code; the reason something is *not* built cannot, and that is what gets
  proposed again three sessions later.

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
1. **`ux-gateway`** — look at the app the way the customer will: the first five
   minutes after a purchase, dead ends, actions that report nothing back, dark
   mode and the phone. First, because what it finds changes the interface.
2. **`security-gateway`** — scan the app for security holes and fix them.
3. **`performance-gateway`** — make sure ~100 parallel users run smoothly.
4. **`compliance-check`** — legal pages (imprint/privacy/terms/withdrawal), GDPR.
5. **`go-live`** — put the app online and verify it live.
6. **`go-to-market`** — positioning, channels, launch plan and finished content
   (landing page, emails, video scripts).

## The golden rules (don't work against them)

- **Sign-in stays mandatory** for all app pages (except home, sign-in, opt-in,
  IPN).
- **Never switch off the IPN signature verification** (`lib/digistore/ipn.ts`).
- **No secrets/API keys in the code.** Always `.env` (Digistore24 key via
  `node run.mjs ds24-connect`); no input fields for keys in the app.
- **For money, customer data, new external systems:** read the skill
  `guardrails` first and stop when in doubt.
