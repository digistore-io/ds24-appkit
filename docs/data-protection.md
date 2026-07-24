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

**`ipn_events` is already pruned after 60 days** (`lib/digistore/ipn-log.ts`,
`node run.mjs db-prune-ipn`, or the cron endpoint). It is the one store here
that exists purely for diagnosis, so it is the one with a short life.

### Operator notes are personal data too

`grants.note` and `token_ledger.note` hold **free text the operator wrote about
a customer** — "comped, angry on the phone" — and `grants.granted_by` records who
wrote it. The app deliberately never shows these to the customer
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
3. **How you answer an access or deletion request.** There is no export function
   and no deletion function in this app beyond deleting a user account, which
   cascades to sessions but deliberately **not** to orders (see above).

Everything else has a shape already: `ipn_events` 60 days, `email_changes` 24
hours, IP addresses fifteen minutes, sessions until they expire.

## 7. What this app does not do

Worth stating, because a privacy policy that claims less is easier to keep true:

- No tracking, no profiling, no automated decision-making.
- No special categories of data (health, beliefs, and so on) — unless *your*
  product adds them, in which case this file needs a section you write.
- No data sold or passed on beyond §5.
- No password is ever readable, mailed, logged, or shown — including to the
  operator.
