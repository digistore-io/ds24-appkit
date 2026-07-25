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
| `orders` | buyer email, first and last name, amounts, currency, Digistore24 order/purchase ids, status, `gdpr_consent_at`, `is_gdpr_country`, and the member it belongs to once attributed |
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
| **Anthropic** — only with the AI assistant switched on | What a member types into the chat, plus the handbook. No name, address, balance or purchase. See §8. |

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
3. **Deletion.** There is no deletion function beyond deleting a user account,
   which cascades to sessions but deliberately **not** to orders (see above).
   Answering an *access* request is solved — see §7.

Everything else has a shape already: `ipn_events` 60 days, `email_changes` 24
hours, IP addresses fifteen minutes, sessions until they expire, and
`chat_messages` until the account is deleted (§8), `mcp_keys` likewise (§9).
`ai_usage` outlives the account with its member link removed (§10).

## 7. Answering a subject access request

Somebody writes and asks what you hold about them. You have **one month**
(GDPR Art. 15; Art. 20 adds the right to get it in a machine-readable form).
One command produces it:

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
(`"enabled"`) plus an `ANTHROPIC_API_KEY`. **It is the first feature in this
template that sends customer input to a third party outside the payment and mail
path, so it needs a paragraph in your privacy policy of its own.**

| Where | What |
|---|---|
| `chat_messages` | every question a member typed and every answer she gave, with the member id and a timestamp |

**What leaves the app, and what does not.** Each question is sent to Anthropic
together with the previous few turns of the same conversation and the handbook
from `content/knowledge/`. Deliberately **not** sent: name, email address,
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

**Anthropic's own terms.** API traffic is not used to train models, and the
retention that applies to it is set by your agreement with Anthropic — read it,
and note that Anthropic is in the USA, so the transfer needs the usual basis.
You need a data processing agreement with them exactly as with the mail
provider.

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

## 12. What this app does not do

Worth stating, because a privacy policy that claims less is easier to keep true:

- No tracking, no profiling, no automated decision-making.
- No special categories of data (health, beliefs, and so on) — unless *your*
  product adds them, in which case this file needs a section you write.
- No data sold or passed on beyond §5.
- No password is ever readable, mailed, logged, or shown — including to the
  operator.
