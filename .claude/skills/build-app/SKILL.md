---
name: build-app
description: THE ENTRY POINT for this template — use this skill as soon as the user wants to start building, wants to get oriented, or opens with something vague ("how do I start?", "Build my app", "what can I do here?"). First clarifies whether a product idea already exists (otherwise hands over to market-research), assigns the project an archetype, creates the data model and pages, and then hands over to setup-digistore for payment. The rules from guardrails apply alongside.
---

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
| Send recurring messages after purchase          | **Drip/Automation** | Schedule table + cron/route, start at `on_payment` |
| Provide a tool/feature for buyers only          | **Gated-Tool**      | Feature pages behind `hasPlan(...)` |
| Manage membership/subscription                  | **Membership**      | `hasPlan(...)` decides access — a cancellation keeps it to the end of the paid period; self-service via `billing-modes` |
| Bill by usage (e.g. AI usage)                   | **Usage/Tokens**    | Prepaid tokens with auto top-up — skill `billing-modes` |

All archetypes use the same base: **auth (`auth.ts`)** for who is signed in, and
the **entitlement API** (`lib/entitlements/manage.ts`) for what they may use.
The Digistore IPN feeds both — it records the payment and maintains the grant
behind it. Reference: `docs/entitlements.md`.

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
- UI with shadcn/ui: `npx shadcn@latest add <component>`. Colors only via tokens
  from `app/globals.css`, nothing hard-coded.
- Messages (notice/success/warning/error) always via `Callout`
  (`components/ui/callout.tsx`, variants `info` | `success` | `warning` |
  `danger`) — no hand-picked color classes. Details in `CLAUDE.md`.
- Every page has to be readable in light **and** dark; the app has a toggle
  (default: system). With tokens this follows by itself.

## Step 3b — Create the operator/admin account

So that the user can sign in as the **operator (admin)** themselves, create an
`owner` account. **Ask the user for their email address** (the one they will
sign in with later) and create the account via CLI — as soon as the DB is
running (`node run.mjs start`):

```bash
node scripts/users/create-user.mjs --email <their-email> --role owner --apply
# or: node run.mjs user-create --email <their-email> --role owner --apply
```

Sign-in is passwordless (email magic link) — the `owner` account created in
advance is reused at the first sign-in. Protect admin-only pages with
`requireOwner()` (`lib/authz.ts`); model to follow:
`app/dashboard/admin/page.tsx`. Normal customers stay `member` (default).
Details: `scripts/users/README.md`.

## Step 4 — Write tests AND run them (mandatory)

Write tests for **every** feature and run them — not optional:
- Test **data logic/rules** with `vitest` (models: `lib/digistore/ipn.test.ts`,
  `lib/digistore/buyUrl.test.ts`). Test pure logic without a DB; DB-dependent
  cases against the local Postgres.
- Typical cases: access rules (entitled → feature, not entitled → no feature,
  refunded → gone, cancelled → still there until the paid period ends), input
  validation, edge and error cases.
- **Running them:** `npm run test` must be **green** before anything continues.
  On top of that `npm run typecheck`. The bundled CI
  (`.github/workflows/ci.yml`) runs both automatically on every push.

### And then: open the app yourself

**Never report "done" without having opened the pages.** Green tests and a
successful build do not rule out an "Internal Server Error" — `vitest` doesn't
render, `npm run build` runs without a database and without a real `.env`. That
is exactly where the error appears that the user then sees first.

```bash
node run.mjs start                # DB + migrations + app
node run.mjs smoke                # opens every page, reports server errors
```

5xx means: fix it before you go on — find the cause with `node run.mjs logs`. A 307 to
`/login` is correct for protected pages. `node run.mjs smoke` skips dynamic pages
(`[id]`); open those once by hand with a real record.

Only then tell the user that they can take a look — and write down what they
will see and at which address.

## Step 5 — Connect payment

Run the skill **`setup-digistore`**. It connects product ID, API key, IPN
webhook and checkout link. The IPN handler (`app/api/ipn/route.ts`) writes
purchases into `orders` automatically — don't reinvent that code.

Does the app bill **recurring (subscription) or by usage (prepaid tokens)**?
Then run the skill **`billing-modes`** afterwards.

## Step 6 — Before the launch: secure it, scale it, legal & live

One after another:
1. **`security-gateway`** — scan the app for security holes and fix them.
2. **`performance-gateway`** — make sure ~100 parallel users run smoothly.
3. **`compliance-check`** — legal pages (imprint/privacy/terms/withdrawal), GDPR.
4. **`go-live`** — put the app online and verify it live.
5. **`go-to-market`** — positioning, channels, launch plan and finished content
   (landing page, emails, video scripts).

## The golden rules (don't work against them)

- **Sign-in stays mandatory** for all app pages (except home, sign-in, opt-in,
  IPN).
- **Never switch off the IPN signature verification** (`lib/digistore/ipn.ts`).
- **No secrets/API keys in the code.** Always `.env` (Digistore24 key via
  `node run.mjs ds24-connect`); no input fields for keys in the app.
- **For money, customer data, new external systems:** read the skill
  `guardrails` first and stop when in doubt.
