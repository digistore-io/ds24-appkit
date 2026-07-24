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

There are guided skills in `.claude/skills/` — use them in this order:
- **`market-research`** — when there is no clear idea yet: interview + research
  → target audience, challenges and a concrete product proposal (product brief).
- **`build-app`** — entry point: choose an archetype, create the data model + pages.
- **`setup-digistore`** — set up billing (API key, IPN, checkout).
- **`billing-modes`** — *(optional)* set up subscriptions (monthly/yearly) and/or prepaid
  tokens with auto top-up + subscription self-service (cancel/payment details/invoices).
- **`security-gateway`** — before the launch: scan for security holes and fix them.
- **`performance-gateway`** — make sure ~100 parallel users run smoothly.
- **`compliance-check`** — legal pages (imprint/privacy/terms/withdrawal) & GDPR.
- **`go-live`** — put the app online and verify it live.
- **`go-to-market`** — marketing: positioning, channels, launch plan, content
  (landing page, emails, video scripts).
- **`guardrails`** — continuous security rules (money/secrets/customer data).

The complete path (as simple as possible for the user, every step hands over to the
next one):

**(0) Idea** `market-research` → **(1) Build** `build-app` → **(2) Payment**
`setup-digistore` *(→ optional `billing-modes` for subscriptions/prepaid tokens)* →
**(3) Security** `security-gateway` → **(4) Scaling** `performance-gateway` →
**(5) Legal** `compliance-check` → **(6) Live** `go-live` → **(7) Marketing**
`go-to-market`. Alongside all of it: `guardrails`.

## Rules

- **Sign-in is not optional for app pages — but it is not automatic either.**
  Protection is **opt-in, not opt-out**: `proxy.ts` guards only what its
  `matcher` lists — today `/dashboard/:path*` — and `auth.config.ts` returns
  true for every other path. **Any new route outside `/dashboard` is public
  until you add it to the matcher.**
  Public by design: the home page, `/login`, `/plans`, `/optin/*` and the IPN
  endpoint `/api/ipn` (secured via the SHA512 signature). `/plans` is public on purpose — a visitor can buy without signing
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
  there are toasts instead — see **UI**. Rule of thumb: what has to stay
  on screen is a `Callout`; what may drift past is a toast.
- **Light and dark both count.** The app ships with a toggle
  (system/light/dark, `components/theme-toggle.tsx`); `System` is the
  default. Every new piece of UI has to be readable in both modes — that follows
  by itself as long as colors come from the tokens. `dark:` classes follow
  the `.dark` class on `<html>` (`@custom-variant` in `app/globals.css`).
- **Tests are mandatory.** Every feature gets `vitest` tests (blueprints in
  `lib/digistore/*.test.ts`); `npm run test` and `npm run typecheck` must be green
  before anything moves on. CI (`.github/workflows/ci.yml`) runs them automatically on
  every push.
- **Call up the app yourself before you say "done".** See below — green
  tests are no proof that the page loads.
- **Linux, macOS and Windows all count.** This app is built with Claude Code,
  and Claude Code runs on all three — so every command in `run.mjs` and every
  script under `scripts/` has to work on all three. Not "mostly": a developer on
  Windows who cannot start the app has no way around it. Details, and the
  reasoning, in **Three systems** further down.

## UI

The app ships with a finished design system. **There is nothing to
design here — there is something to use.** Whoever builds their own buttons, tables or
colors doesn't make the app more individual, only inconsistent: the
hand-built variant tips over in dark mode, has no focus ring and looks
different again two pages later.

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

**The four rules that count:**

1. **Every action reports back.** Server Actions return
   `{ error, ok }`; the page calls `useActionToast(state)`
   (`hooks/use-action-toast.ts`) and gets success in green, errors in red. An
   action without feedback feels like an error to the user.
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
```

`node run.mjs smoke` (`scripts/dev/smoke.mjs`) finds the pages by itself under `app/`
and rates them like this:

- **5xx** → error. Fix it, don't argue it away, don't pass it on as a "known
  issue".
- **307 to `/login`** → correct. Protected pages are supposed to redirect.
- **2xx** → fine.

On an error the cause is in the log: `node run.mjs logs`. That's where the real
stack trace is; the page in the browser often shows only the meaningless sentence.

Two things `node run.mjs smoke` cannot do:

- **Dynamic pages** (`app/…/[id]/page.tsx`) are skipped — without a real ID
  the request is pointless. You call such pages up by hand once with a
  real record.
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
7. **`node run.mjs start && node run.mjs smoke`** — call the new page up yourself. Only then
   is it done (see "Never ship a broken page").

## Users & roles

The `users` table has a `role` field (`db/schema.ts`):
- **`owner`** — SAAS operator (admin). Access to admin areas.
- **`member`** — regular customer (default for self sign-in via magic link).

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

`node run.mjs smoke` cannot see this page — it skips `[id]` routes. Open it by hand with
a real Member id after changing anything there.

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

**There are no passwords** — signing in happens via magic link. The
counterpart to "reset password" is therefore the menu entry
**send sign-in link**; it runs through `signIn()` from Auth.js so that exactly
the same token mechanism applies as with a normal sign-in.

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

## Plans & Digistore products

The plan list in `config/digistore-products.json` is the **single source** —
it feeds the plans page (`app/plans/page.tsx`) *and* the sync script. Don't create
a second price list in the code.

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
publish your machine), and `--no-tunnel` switches the behaviour off for CI.
A public `APP_URL` never reaches this path at all, so STAGING and PROD are
untouched — there the domain is the right answer and a tunnel would be wrong.

**`node run.mjs ds24-tunnel`** does the same thing on its own, for when you want the
address without touching the products. It runs in the background and returns.

**`node run.mjs stop` closes it, `node run.mjs start` re-opens it** — for an app that already
has an IPN connection (`DIGISTORE_IPN_DOMAIN_ID` in the `.env`); others are left
alone. The address is new on every open, so `node run.mjs start` re-points Digistore24
at it via the stable `domain_id`. Without that step the old, dead address would
stay registered and every purchase would run into the void.

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
- `node run.mjs start` — database + migrations + app (http://localhost:3000). Occupied
  ports resolve themselves: the app moves to the next free one (remembered in
  `.dev/port`, all further commands use it), the database likewise — there
  `DB_PORT` and `DATABASE_URL` in `.env` are pulled along. If an instance of
  **this** project is already running on the port, it aborts instead of starting
  a second one. Force it: `node run.mjs start --port 3005`.
- `node run.mjs stop` — stop app + database · `node run.mjs restart` · `node run.mjs logs` · `node run.mjs status`
- `node run.mjs test` — TypeScript check + tests (including the IPN signature verification)
- `node run.mjs smoke` — call every page once; finds "Internal Server Error"
- `node run.mjs db-generate` / `node run.mjs db-migrate` — create / apply a migration
- `node run.mjs db-reset` — clear the local DB, migrate, seed (**locally only**)
- `node run.mjs user-create --email … --role owner --apply` — create an operator/admin account
- `node run.mjs mail-setup` — set up mail delivery (Postmark or SMTP) + test mail
- `node run.mjs ds24-connect` — fetch the Digistore24 API key and store it in `.env`
- `node run.mjs ds24-tunnel` — public address onto the local app **and** the IPN registered
  on it, so a real purchase reaches your machine (runs in the background;
  `node run.mjs status` shows it, `node run.mjs stop` ends it)
- `node run.mjs build` — production build

The npm scripts behind them (`npm run dev`, `npm run db:migrate`, …) remain
usable; when in doubt name the `node run.mjs` command, that one is meant for
non-developers — and it is the one that works on all three systems (see **Three
systems**). There is still a `Makefile`, but it only forwards here; never point
the user at `make`, it is missing on Windows.

## Three systems

**This app has to run on Linux, macOS and Windows.** Claude Code runs on all
three, so all three are places where somebody builds their product on this
template. That is a property of the app, not a nice-to-have: a developer on
Windows who cannot start it has no way around it.

**What has to be installed** — the list is deliberately short, and
`node run.mjs doctor` checks it for you and names the install command for the
system you are on:

| | Linux | macOS | Windows |
|---|---|---|---|
| **Node.js ≥ 20** (with npm) | package manager / nodejs.org | `brew install node` | `winget install OpenJS.NodeJS` |
| **git** | usually present | with the Xcode Command Line Tools | Git for Windows (Claude Code needs it) |
| **Docker** (Postgres) | Docker Engine | Docker Desktop | Docker Desktop (uses WSL2) |
| **cloudflared** *(optional, only for local IPNs)* | pkg.cloudflare.com | `brew install cloudflared` | `winget install Cloudflare.cloudflared` |

Nothing else. In particular **no `make`** — it is missing on Windows entirely
and on macOS until someone installs the Xcode CLT, which is why the commands
run through `node run.mjs <command>` (see **Local commands**). A `Makefile` is
still in the project, but only as an alias for whoever has make; never point the
user at it.

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

**The rule of thumb that settles most cases: anything that starts, stops or
finds a process belongs in a `.mjs` script, not in bash.** Node is guaranteed
present — it is a Next.js app — and `child_process.spawn`, `process.kill` and
`fs` behave the same on all three systems, while every shell tool above does
not.

**Ask the thing, not the process table.** Whether a service is alive is best
answered by talking to it — a TCP connect, an HTTP GET — not by hunting for it
in `ps`. That is portable by construction, it survives a recycled PID, and it
answers the question you actually care about ("does it respond?") instead of a
proxy for it. `scripts/dev/ports.mjs` is written that way on purpose.

**One Windows-only trap in Node itself:** spawning `npm` or `npx` needs
`shell: true`, because those are `.cmd` shims and Node has refused to run them
without a shell since 18.20/20.12 (it fails with `EINVAL`). Our own scripts are
therefore started as `spawn(process.execPath, ["scripts/…mjs", …args])` — no
shell, so user arguments cannot be mangled by quoting. `docker` is a real
executable and needs neither. Both rules are written out at the top of `run.mjs`.

`scripts/portability.test.ts` scans `run.mjs` and `scripts/` for the tools in
the table above and fails the test run if one shows up. It is the reason this
does not quietly rot back into a Linux-only project — don't switch it off.

## STOP criteria

For changes to billing logic, signature/auth checks, the export/deletion
of customer data or new external payment/data integrations: first read `guardrails`
and, when in doubt, involve a human.
