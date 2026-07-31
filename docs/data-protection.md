<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# What this app stores about people

**This is not legal advice.** It is a factual inventory, written so that whoever
drafts your privacy policy — a lawyer, a generator, or the `compliance-check`
skill — is working from what the code actually does instead of guessing. Every
row below was read out of `db/` and `lib/`, not remembered.

Keep it current. A privacy policy is only as true as the list it was written
from, and this file is that list.

## 1. Accounts

| Where | What | Why it exists |
|---|---|---|
| `users` | email, name, profile image (OAuth only), role, sign-up date | The account itself. The address is also the sign-in credential. |
| `users.passwordHash` | a scrypt hash — **never** the password | Optional password sign-in. One-way; nobody, including the operator, can read it back. |
| `users.checkoutToken` | 10 random characters | Corroborates the member id inside the Digistore24 checkout. Not a credential, tied to no person beyond the account. |
| `users.blockedAt` | timestamp | When the operator blocked the account. |
| `accounts` | OAuth provider tokens (only if Google sign-in is enabled) | Lets Google sign-in work. |
| `sessions`, `verificationTokens` | Auth.js bookkeeping | Sign-in links and their single use. |

## 2. The address change

`email_changes` holds one row per Member with a change in flight: the member id,
**the address they asked to move to**, a SHA-256 of the confirmation token, and
two timestamps.

Two things about it worth saying out loud in a privacy policy:

- **The target address may belong to somebody else.** It is typed by hand, so a
  typo puts a stranger's address in this table — somebody who never used the app
  and never agreed to anything. That is why the row is deleted as soon as it
  expires (24 hours), and why expired rows anywhere in the installation are
  cleared on the next request rather than waiting for a scheduled job.
- **The token is stored hashed**, so a database dump yields no working
  confirmation links.

## 3. Purchases and billing

| Where | What |
|---|---|
| `orders` | buyer email, first and last name, amounts, currency, Digistore24 order/purchase ids, status, `is_gdpr_country`, and the member it belongs to once attributed |
| `subscriptions`, `invoices` | billing state and Digistore24-hosted invoice links |
| `token_accounts`, `token_ledger` | prepaid balance and every movement of it |
| `grants` | which plan a member holds, and where it came from |
| `ipn_events` | **the complete raw webhook body from Digistore24, buyer data and all** — kept for diagnosing a rejected or mis-signed webhook |
| `buy_url_cache` | checkout links; no personal data |

**`ipn_events` is pruned after 60 days, automatically.** It is the one store
here that exists purely for diagnosis, so it is the one with a short life. The
app deletes them itself — a daily job, `prune-ipn-log` in `config/cron.json`
(`docs/cron.md`), with `node run.mjs db-prune-ipn` still available for the case
where you want them gone and the app is down.

⚠️ **The retention promise in your privacy policy is only as true as that job.**
It runs by itself and it records every run, so `node run.mjs cron --list` is how
you check rather than assume. `last run: never` means the sentence you published
is not describing what your app does.

### Operator notes are personal data too

`grants.note` and `token_ledger.note` hold **free text the operator wrote about
a customer** — "comped, angry on the phone" — and `grants.granted_by` records who
wrote it. The app deliberately never shows **these** to the customer
(`lib/entitlements/leak-guard.test.ts` enforces it), and that is a product
decision about tone, **not** a data-protection exemption: a data subject asking
what you hold about them is asking about these too. Write them as if they will
be read out.

## 4. Sign-in security data

**IP addresses.** Failed password sign-ins are counted per originating IP
(`X-Forwarded-For`) to stop one password being tried across many accounts. The
address is held **in memory only, for fifteen minutes**, is never written to the
database, and is used for nothing else. Nothing is logged.

This still needs to appear in a privacy policy: an IP address identifies a
person, and "we do not store it" is not the same as "we do not process it". The
basis that normally fits is a **legitimate interest in securing the service**,
and the honest description is short — *"failed sign-in attempts are counted by
IP address for fifteen minutes to prevent password guessing; the address is held
in working memory only and is not stored."*

Sign-in attempts by *address* are counted the same way, as are requests to change
an address (see `lib/rate-limit.ts` for all of it).

## 5. Who else sees this data

An operator needs a data processing agreement with each of these. All three are
processors acting on the operator's behalf, not independent controllers — except
Digistore24, whose role depends on your contract with them.

| Recipient | What reaches them |
|---|---|
| **Digistore24** | Everything about a purchase. Where they act as **reseller**, they are the buyer's contractual partner and a controller in their own right for parts of it — check your contract, it changes what your policy has to say. |
| **The mail provider** (Postmark or your SMTP host) | Recipient address and the content of every sign-in link, confirmation link and credential notice. |
| **The host** (Railway, Render, Fly, …) | Everything, by virtue of running the database and the app. |
| **An AI company** — only with the AI assistant switched on | What a member types into the chat, plus the handbook. No name, address, balance or purchase. **Which company it is, is the Operator's choice** (`config/ai-models.json`, five candidates, shipped as `"auto"` = whichever key is in the `.env`) — so this row cannot name one for you, and a privacy policy that guesses is wrong for most installations. `node run.mjs ai-check` says which it is. See §8. |

No analytics, no tracking pixels, no advertising SDKs ship with this template.
**If you add none, you need no cookie banner** — the only cookies set are the
session, the language choice and the theme, all strictly necessary or set by
your own action.

## 6. Retention — and the one question that was deferred to here

The 2026-07-21 PRD deferred a question to `compliance-check`: unattributed
purchases accumulate for ever, holding a buyer's email and name for people who
never became customers of the app. It framed this as two forces pulling opposite
ways — commercial record-keeping versus the right to erasure.

**For the purchase records themselves, they do not actually pull opposite ways.**
An order is an accounting record, and in Germany §147 AO and §257 HGB *require*
it to be kept (six to ten years depending on the document). The GDPR anticipates
exactly this: the right to erasure does not apply where processing is necessary
to comply with a legal obligation (Art. 17(3)(b)). So an unattributed purchase is
not a deletion problem during that period — it is a mandatory-retention case, and
deleting it on request would be the violation.

What genuinely remains open, and what an operator should decide with advice:

1. **What happens after the retention period.** Nothing in this app deletes an
   order, ever. That is correct for year one and wrong by year eleven.
2. **Whether the buyer's name is needed at all.** `buyer_first_name` and
   `buyer_last_name` come from Digistore24 and the app never uses them for
   anything. Data minimisation asks why they are stored — a fair answer may be
   "the invoice needs them", but it should be an answer, not an accident.
3. **Deletion is solved for the account, not for the aftermath.** A member
   deletes their own from `/dashboard/account` (Art. 17, no support ticket
   needed), and an Operator can delete one from the user list. Both cascade to
   sessions, chat transcripts, MCP keys, grants, pending address changes,
   consent records and impersonation rows — and both deliberately leave
   `orders`, `subscriptions`, `token_ledger` and `ai_usage` standing with the
   member link set to `null`, for the reason above. The dialog names both halves
   before the button, because "delete my account" reads as "delete everything"
   and here it is not.

   The refusal worth knowing: the **last remaining owner** cannot delete
   themselves. Not a GDPR problem — it is temporary and in their own hands
   (promote somebody, then leave) — but an app with no admin has no way back in.

   What is still open is the same thing as point 1: nothing deletes an order
   once its retention period has actually run out.

Everything else has a shape already: `ipn_events` 60 days, `email_changes` 24
hours, IP addresses fifteen minutes, sessions until they expire, and
`chat_messages` until the account is deleted (§8), `mcp_keys` likewise (§9).
`ai_usage` outlives the account with its member link removed (§10).

## 7. Answering a subject access request

Somebody writes and asks what you hold about them. You have **one month**
(GDPR Art. 15; Art. 20 adds the right to get it in a machine-readable form).

**Most of the time nobody writes, because they can help themselves.** A signed-in
member downloads their own copy from `/dashboard/account` — the same data, minus
the raw webhook payloads (see the review warnings below: those can carry a third
party's details, and a self-service download has nobody in between to redact
them, which Art. 15(4) cares about). The two exports are held together by
`lib/privacy/export.test.ts`, so adding a table to one and forgetting the other
fails the build.

The command below is for the rest: somebody who never had an account, somebody
who asks by email, and the case where you need the payloads too.

```bash
node run.mjs data-export --email kunde@example.de
node run.mjs data-export --email kunde@example.de --out auskunft.json
```

It searches **by address, not by account** — deliberately. The people most
likely to ask are the ones who never got an account: a purchase made without
signing in leaves an order carrying their name and address and no member id at
all. An account-scoped export would have answered "we hold nothing about you"
while holding exactly that. Where an account does exist, both routes are
followed and merged.

**Read the file before you send it.** Two things in it need your eyes:

- **`webhookEvents[].payload`** is the raw body Digistore24 posted, and it can
  carry fields about *other* people — an affiliate, for instance. Third-party
  data has to come out before the file leaves your hands.
- **`grants[].note` and `tokenLedger[].note`** are what *you* wrote about this
  person. They belong in the answer — the app hides them from the customer's own
  screen as a matter of tone, and that is not an exemption from a legal request.
  Read them before they are read to you.
- **`chatMessages[].content`** is what they typed into the assistant. Same
  redaction rule as the payloads: people paste things into a chat box that
  nobody asked for, sometimes about somebody else.

Deliberately not in the file: the password (a one-way hash nobody can read back,
and handing over a credential creates risk rather than satisfying a right),
OAuth tokens, and spent sign-in tokens. The file says so itself, in an
`aboutThisFile` block written to be forwarded along with it.

## 8. The AI assistant

Only relevant if the in-app chat is switched on — `config/ai-chat.json`
(`"enabled"`) plus a key for whichever provider her `chat` task resolves to.
**Name that company in your privacy policy**: it is the recipient of the data,
and with the shipped `"auto"` binding it is decided by which key is in the
`.env` rather than by anything in this file. `node run.mjs ai-check` says which
one it is. **It is the first feature in this
template that sends customer input to a third party outside the payment and mail
path, so it needs a paragraph in your privacy policy of its own.**

| Where | What |
|---|---|
| `chat_messages` | every question a member typed and every answer she gave, with the member id and a timestamp |

**What leaves the app, and what does not.** Each question is sent to the
provider bound to the `chat` task together with the previous few turns of the
same conversation and the handbook from `content/knowledge/`. Deliberately
**not** sent: name, email address,
balance, orders, plans, role — nothing about the person. That is why the
assistant is told she cannot see the account (`lib/ai/prompt.ts`), and it is
also the answer when a customer asks whether "the AI can see my data". It cannot.

What a *member* puts into the box is another matter, and it is the risk worth
naming in your policy: people paste order numbers, addresses and occasionally
things nobody asked for. That text is stored in `chat_messages` and was sent to
the API.

**Retention.** Transcripts are kept until the member's account is deleted, and
go with it (`on delete cascade` — unlike orders, which are accounting records
that must be kept). There is no automatic pruning; if you want one, it belongs
next to the IPN-log prune (`node run.mjs db-prune-ipn`) and is a decision to
make deliberately rather than to inherit.

**That company's own terms are yours to read.** All five candidates state that
API traffic is not used to train models, but the retention that applies to it is
set by *your* agreement with *them* — and four of the five (OpenAI, Anthropic,
Gemini, OpenRouter) are in the USA, so the transfer needs the usual basis
(standard contractual clauses, or the EU-US Data Privacy Framework where the
company is certified). Mistral is in France, which is the one case where no
third-country transfer arises at all. You need a data processing agreement with
whichever one you use, exactly as with the mail provider — `avv-register.md`
under `docs/compliance/` is where `compliance-check` writes the list down.

**Switching it off removes all of it.** An app that leaves `"enabled": false`
sends nothing, stores nothing and needs none of the above in its policy.

## 9. The MCP server (AI interface)

Only relevant if it is switched on — `config/mcp.json` (`"enabled"`). See
`docs/mcp.md`.

| Where | What |
|---|---|
| `mcp_keys` | one row per key a member issued to themselves: the name **they** typed ("Claude on my laptop"), the scope, when it was created, when it expires, when it was revoked, and the day it was last used |

**The key itself is not in there.** The column holds a SHA-256 of it, and the
plaintext is shown exactly once, in the dialog that created it. Nobody can read
it back — not the operator, not a support screen, not
`node run.mjs data-export`. That is deliberate: a key acts with its owner's
rights, so an operator who could read one could act as that customer.

**The name is personal data**, in the same way `grants.note` is: it is free text
attached to an identified person, so it belongs in a subject access request and
in this list. It is usually the name of a device, which is more than it looks.

**`last_used_at` is written at most once a minute**, not per call. The question
it answers is "is this key still in use", and a minute's resolution answers it —
an exact value would be a usage log of when somebody works.

**What leaves the app.** Nothing. Unlike the assistant in §8, this server calls
no third party: an MCP client connects **to** your app, and what the model on
the other end does with the answer is governed by whatever agreement your
customer has with *their* AI provider, not by yours. Worth one sentence in your
policy all the same, because the data your app returns does reach that provider
— the customer chose it, but they chose it inside your product.

**Retention.** Keys go with the account (`on delete cascade`), like the chat
transcripts and unlike the orders. A revoked key keeps its row rather than being
deleted, so a member can still see that it existed and when they revoked it.

**Switching it off removes all of it.** An app that leaves `"enabled": false`
has no endpoint, no keys and nothing to write in its policy.

## 10. AI usage (the cost record)

Only relevant if a task uses a model — today that is the assistant (§8). See
`docs/ai-providers.md`.

| Where | What |
|---|---|
| `ai_usage` | one row per model call: which task, which provider, which model, token counts, how long it took, whether it worked, and the member it was made for |

**It holds no content.** No prompt, no answer, nothing a member typed. That is
structural rather than a promise — there is no column that could carry one. What
was said is stored where it belongs: `chat_messages` for the assistant (§8), your
own tables for anything you build.

**Why the member is on it at all.** So an Operator can see which customer's use
drives their AI bill — the number their own pricing depends on. It is the only
personal reference in the table, and it is what puts these rows in a subject
access request: they record a person's activity, with timestamps, even though
they say nothing about what that person said.

**The AI-costs page does not show it.** `/dashboard/admin/ai-costs` reports
spend by task, by model and by day, and has no member column at all — turning a
cost report into a per-customer activity log is not something the Operator asked
for, and it is the one addition here that would need a paragraph in a privacy
policy. The link stays on the row for the export and for the deletion rules
below; nothing renders it.

**Retention differs from the chat on purpose.** A chat transcript goes with the
account (`on delete cascade`); an AI-usage row **stays and loses its member
link** (`on delete set null`), like an order. What the Operator spent is their
own accounting record and does not stop being true when a customer leaves. An
export made after a deletion therefore correctly finds none.

**This is the first table that grows with USE rather than with customers** — one
row per model call, for ever, so it is the one with an automatic retention
window. **Rows are deleted after 12 months**, by a daily job the app runs
itself: `prune-ai-usage` in `config/cron.json` (`docs/cron.md`). Change the
window by changing `retentionMonths`; `node run.mjs db-prune-ai --dry-run` shows
what a different one would remove before you commit to it, and works with the
app stopped.

⚠️ **Pruning deletes cost history.** A period that has been pruned reads as
**zero** on the AI-costs page rather than as unknown. Twelve months is chosen so
a year-on-year comparison stays possible; shortening it is a data-minimisation
gain and an accounting loss, and it is the Operator's call which matters more.

**Nothing leaves the app because of this table.** It is written locally and read
locally. What does leave — the prompt itself — is §8's business, and which
company receives it is now the Operator's choice rather than a fixed one; the
answer lives in `config/ai-models.json`.

## 11. The scheduler's own record

`cron_runs` — one row per scheduled job: when it last ran, whether it worked,
and a one-line summary of what it did.

**It holds no personal data, and that is a rule rather than an observation.** A
job's summary line is a COUNT and a window ("412 rows older than 12 months"),
never a row, an address or anything a member typed. `docs/cron.md` states it
where whoever adds a job will read it, because a job that logged *which*
customers it touched would put personal data into a table that is otherwise free
of any privacy question.

It is worth a sentence in a privacy policy for the opposite reason to most of
this file: it is the **evidence** that the retention promises above are kept.
`node run.mjs cron --list` answers "is the 60-day deletion actually happening",
and without it the honest answer would be "probably".

## 12. Signing in as a user (operator access)

`impersonations` — one row every time an operator used **"sign in as this
user"** on somebody's account.

| Column | What it holds |
| --- | --- |
| `operator_id` | which admin it was. Survives that admin's deletion as `null` — this is evidence, and it does not stop having happened |
| `member_id` | whose account was entered. Deleted **with** the member (`on delete cascade`), because the row is that member's personal data |
| `started_at`, `expires_at`, `ended_at`, `ended_by` | when, until when it was allowed to run, when it actually stopped, and what stopped it |

**This is the section a customer's question lands in.** *"Has anyone from your
company been in my account?"* is a data-protection question with a specific
answer here, and it is the reason the feature is defensible rather than being a
back door: an operator can see what a customer sees, and the customer can find
out that they did.

**What it deliberately does NOT hold is what the operator did while inside.** No
page list, no actions, no keystrokes. That is a decision, not a gap: an activity
log of a support session is a surveillance log of the customer's own data. The
changes that matter leave their own records anyway — `token_ledger`, `grants`,
`email_changes`, `ai_usage`.

**What an operator can do while signed in as somebody** is everything that
person can do, with one carve-out: an automatic token top-up is suppressed, so a
support session can never charge a customer's stored payment method
(`lib/tokens/spend.ts`). Anything they *do* spend is debited from the customer's
balance and appears in that customer's own ledger, under the customer's name —
which is worth knowing before you answer a question about a balance.

**Retention: 12 months**, then the rows are deleted by the scheduled job
`prune-impersonations` (`config/cron.json`). The same window as `ai_usage`.
Shortening it weakens the answer above; there is no legal obligation pulling the
other way, so it is yours to set.

**In a subject access request** it appears as `impersonations[]`, with the
operator's **address** rather than a generic "an administrator" — in a business
with more than one admin, the generic answer is no answer.

**If your installation must not have this capability at all**, set
`"enabled": false` in `config/impersonation.json`. The menu entry disappears and
the server action refuses. The record of sessions that already happened stays
readable, which is the point.

## 13. Consent records

`consent_records` — what a member agreed to, which wording they read, and when.
**Empty in an app that declares no purposes in `config/consent.json`, which is
what ships**, because this app needs consent from nobody: a purchase runs on
Art. 6(1)(b) and the three cookies it sets are strictly necessary or set by the
user's own click (§5). The table exists for the day the app grows something that
does need one — a marketing mail, an analytics tag.

| Column | What it holds |
| --- | --- |
| `purpose` | which question, as declared in `config/consent.json` |
| `granted` | `true` = agreed, `false` = refused **or** withdrawn |
| `text_version` | which version of the wording they read |
| `locale` | which language they read it in |
| `created_at` | when |

**It is append-only.** A withdrawal is a NEW row, never an edit of the old one —
Art. 7(1) asks you to be able to *demonstrate* that consent was given, and a row
you overwrote demonstrates nothing. So the current answer for a purpose is
simply its newest row, and refusals are kept alongside the agreements: a refusal
is the evidence that "no" was honoured, and it is what stops the dialog asking
again tomorrow.

**`text_version` is why a boolean was not enough.** Somebody who agreed to *"we
mail you when your invoice is ready"* has not agreed to *"we mail you offers
from our partners"*. Bump the version when you edit the sentence and every
consent given to the old one correctly counts as unasked again.

**No IP address, deliberately.** Consent logs in the wild routinely store one
"as proof"; it proves very little, this app stores none anywhere (§4), and
Art. 7(1) does not ask for one. Adding it would introduce a new category of
personal data in the name of data protection.

**Retention:** goes with the account (`on delete cascade`), like the chat
transcripts and unlike the orders. Once the person is gone, so is the processing
their consent permitted, and keeping the record would be keeping personal data
for its own sake.

It appears in a subject access request as `consents[]` — in both exports.

## 14. Uploaded and generated files

Only relevant once the app takes files — `config/media.json` decides who may
upload what. See `docs/visuals.md`.

| Where | What |
|---|---|
| `media` | one row per stored picture, video, recording or downloadable file: what kind it is, its media type, its size, **the filename the person chose**, the alternative text, and when it arrived. For a generated image also the prompt and which model made it |
| the bucket | the file itself. Object storage, outside this database — see §5 for the recipient |

**The filename is personal data.** Somebody typed it, and people name files
after themselves, their company or their customer. It is in both exports.

**Location and camera data are removed from uploaded images.** A photograph
taken on a phone carries where it was taken to within a few metres, and nobody
looking at the picture can tell it is there. JPEG, PNG and WebP are stripped on
the way in (`lib/media/exif.ts`).

**And an image format that cannot be stripped is not accepted**, which is what
keeps the sentence above true rather than approximately true. GIF is the case
that exists today: its metadata sits in Comment and Application Extension
blocks that `exif.ts` does not walk. Adding `image/gif` — or any other
unstrippable type — to `config/media.json` does not quietly widen what this
page promises: the type is dropped from the accepted list, an upload of one is
refused, and `node run.mjs media-check` names it. **Files already stored are
left alone**, so a config mistake never makes existing pictures unreachable.

**A file that arrives damaged is refused rather than stored half-stripped.** If
the walk cannot parse a JPEG, PNG or WebP it cannot promise anything about what
is left in it, so the upload is rejected with "that file looks damaged" instead
of being stored with its metadata possibly intact. That refusal is the reason
the promise on this page holds for every stored image and not merely for the
well-formed ones.

⚠️ **Video is not stripped, and a privacy policy written from this file must not
claim otherwise.** An MP4 can carry its recording location in a metadata atom.
Removing it means walking the atom tree and rewriting the offsets that depend on
it, and a half-done job is worse than none because the file then reads as
protected. If your app takes video from customers, either say so or do not take
it.

**Retention.** A file goes with the account that uploaded it (`visibility:
"owner"`). Deleting an account removes **the objects from the bucket as well as
the rows** — a foreign key cascade only reaches the database, and files left
behind would be a deletion request that was not honoured
(`lib/media/manage.ts` → `deleteOwnedMedia()`).

Files that belong to the PRODUCT rather than to a person — a lesson cover, a
workbook you sell — stay when the operator account that uploaded them is
deleted. That is why the foreign key is `set null` and not `cascade`.

It appears in a subject access request as `media[]` — in both exports. The files
themselves are not in the JSON; the member downloads them from the app.

## 15. What this app does not do

Worth stating, because a privacy policy that claims less is easier to keep true:

- No tracking, no profiling, no automated decision-making.
- No special categories of data (health, beliefs, and so on) — unless *your*
  product adds them, in which case this file needs a section you write.
- No data sold or passed on beyond §5.
- No password is ever readable, mailed, logged, or shown — including to the
  operator.
