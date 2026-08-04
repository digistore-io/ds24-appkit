<!-- Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA — SPDX-License-Identifier: MIT -->

# Setting up sign-in

By default the app uses **email token sign-in (magic link)**. The user enters
their email, gets a sign-in link sent to them and is signed in after clicking
it. For that the app needs **mail delivery**: either **Postmark** or **SMTP**.
**Google sign-in is optional** on top of that.

**`/login` asks for the address first, and only then for whatever that address
actually needs to prove.** One dialog, two steps: an address with a password is
asked for it, an address without one is mailed a link, and on a demo
installation (see below) it is simply signed in. The branch is one pure
function, `routeForSignIn` in `lib/auth/sign-in-route.ts`; the dialog around it
is `app/login/{page,ui,actions}.tsx`.

Three properties of that flow are decisions rather than accidents:

- **The password is asked for first, before demo mode is considered.** Inside
  `routeForSignIn` the demo branch comes last, and leading with `if (demoLogin)`
  would read better while silently making every password set on a demo machine
  unusable. Demo mode is a property of the installation; a password is a thing
  its owner set on themselves, and the owner's choice wins.
- **It tells a stranger whether an address has a password.** A password field
  appearing is the answer, and anyone can type any address. What it never
  reveals is whether an *account* exists: an unknown address and a known one
  without a password take the same branch. The lookup is rate-limited (below)
  so the answer cannot be harvested at speed. If that trade is wrong for your
  app, the place to change it is `routeForSignIn` — make step 2 always ask for
  a password and offer the link beside it, for every address.
- **Step 2 offers "send me a link instead".** That is not decoration: it is the
  only way back in for somebody who has forgotten their password, because this
  app has no reset flow (below).

**A password is optional too — and it is the Member's choice, not yours.**
Anyone signed in can set one on their own account page (`/dashboard/account`)
and remove it again just as easily. It saves the round-trip through the inbox
and works on a machine where their mail is not open. There is nothing to set up
for it: no environment variable, no provider to enable. An account without a
password behaves exactly as it always did, which is the common case and stays
that way.

Two consequences worth knowing before you go looking for them:

- **There is no "forgot password" flow, and none is missing.** Whoever forgets
  theirs signs in with a magic link exactly as before and sets a new one — the
  button for it sits on step 2 of the sign-in dialog, beside the password field.
  The magic link *is* the recovery path, which is why mail delivery stays a hard
  requirement even for accounts that have a password, and why removing that
  button would lock people out rather than merely tidy the form.
- **Five things are rate-limited**, all in a sliding window (`lib/rate-limit.ts`):
  failed password sign-ins, ten per quarter hour per address **and thirty per
  quarter hour per origin** — the second catches one password sprayed across
  many accounts from one source, which the per-address counter cannot see
  because it only ever gets one hit per address. The origin comes from
  `x-forwarded-for`, so it is only meaningful behind a proxy that overwrites
  that header, which every hoster this template targets does; without one the
  limit simply does not engage. Then: requests to
  change an address, three per hour — counted per account *and* per target
  address, so the same mailbox cannot be hit again from the next account; and
  address *lookups*, twenty per hour per account, which meters the "that address
  is already taken" answer so it cannot be used to enumerate accounts for free.
  Finally the **sign-in dialog's step-1 lookup**, twenty per quarter hour per
  address and sixty per origin — the counter that stops the "does this address
  have a password?" answer above from being harvested in bulk. It counts every
  hit rather than only failures, because a lookup has no failure: the answer is
  the thing being metered.
  The counters live in memory, in one process — run several app instances
  behind a load balancer and each keeps its own, which multiplies every limit
  by the number of instances. That is a known limitation of the single-process
  shape this template ships with, not an oversight.
- **Members change their own address**, confirmed by a link sent to the new one
  (`/dashboard/account` → `/account/confirm-email`). Nothing moves until that
  link is followed, so an abandoned or mistyped request costs nothing and the
  old address keeps working throughout. The confirmation page needs no session —
  the mail is read wherever the inbox is.
- **Every credential change mails the Member** — set, changed, removed, and the
  address change tells the address the account just left. Without
  it, somebody who reaches an unlocked machine could set a password on the
  account and the owner would never learn of it. The notice deliberately
  contains **no link**, so it is safe to receive and useless to forge; what the
  recipient does with it is contact you. Where no transport is configured the
  change still goes through and the notice is skipped with a log line — a
  failed mail must never undo a password the Member has already set.

All values go into the `.env` (template: `.env.example`). Always set the basics:

```bash
AUTH_SECRET=        # filled in locally by `node run.mjs start`
AUTH_TRUST_HOST=true
APP_URL=https://your-domain.de
# APP_NAME=My App      # optional override; the mails fall back to NEXT_PUBLIC_APP_NAME
```

## Mail delivery — option A: Postmark (recommended, simple)

1. Create an account at [postmarkapp.com](https://postmarkapp.com), create a
   **server** and copy its **server API token**.
2. Under *Sender Signatures* (or a whole domain) **verify your sender
   address** (set DKIM/Return-Path). This address is the "sender ID".
3. Into the `.env`:

```bash
POSTMARK_SERVER_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POSTMARK_SENDER=login@your-domain.de    # verified sender
# POSTMARK_MESSAGE_STREAM=outbound       # default
```

## Mail delivery — option B: SMTP (any mailbox)

Works with any mail server/mailbox (e.g. your own host). Into the `.env`:

```bash
SMTP_HOST=smtp.yourprovider.de
SMTP_PORT=587            # 587 = STARTTLS, 465 = SSL
SMTP_SECURE=false        # true only on port 465
SMTP_USER=mailbox@your-domain.de
SMTP_PASSWORD=…
SMTP_FROM=login@your-domain.de
```

If **neither Postmark nor SMTP** is set, email sign-in is not offered.

## What the mails look like — and the sender rule that keeps them credible

Every mail this app sends renders through **one layout** (`lib/email.ts`): the
app's name above the card, a greeting, a short body, one button in the app's
own accent colour — `--primary` from `app/globals.css`, read at send time and
converted to hex, so a recolour reaches the mails by itself — a *"didn't ask
for this? ignoring it is safe"* line, and a footer naming the sender and
linking the legal pages the app actually serves (Impressum and
Datenschutzerklärung from the start, AGB and Widerrufsbelehrung once
`compliance-check` has created them; `availableLegalPages()` decides, so a
link to a 404 cannot happen). A plain-text version with the same content
travels alongside for clients that prefer it.

Two values feed the branding, and both are deploy-time environment:

- **The name** comes from `NEXT_PUBLIC_APP_NAME` — the same variable the
  interface reads — with `APP_NAME` as an override for mails that should say
  something else. Set neither and the mails are generic ("Your sign-in link"
  instead of "Your sign-in link for Fangfertig"); that is the single most
  common branding gap on a first deploy, because the interface looks finished
  while the mails do not.
- **The legal links** need `APP_URL` — without it the footer simply has none.

The one deliberate exception is the credential-change notice (below): same
look, **no link, ever** — not even the Impressum.

**The sender address MUST live on the app's own domain** — `login@your-domain.de`
for an app on `your-domain.de`, verified at the provider (DKIM/SPF; at
Postmark: a sender signature or the whole domain). A sign-in mail whose links
point at your domain but whose From is somebody else's is the exact shape of a
phishing mail: recipients report it, filters score it, and enough reports put
the app's domain on Google's Safe Browsing list — a red **"Dangerous site"**
page in front of every sign-in link. If that has already happened:
[`docs/troubleshooting.md`](troubleshooting.md) → *Chrome calls the sign-in
link a "Dangerous site"*.

## Google sign-in (optional)

Convenient for users, but **setup + approval take time**: Google reviews apps
with an OAuth consent screen; approval for external users can take **several
days to weeks**. Until then sign-in only works for manually entered test
users. Email sign-in is ready to go right away — Google can be added later at
any time.

Steps in the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: enter user type "External", app
   name, support email, domain(s) and developer contact. The scopes `email`,
   `profile`, `openid` are enough. Start in **test mode** (enter test users),
   later "Publish" → go through Google **verification** (takes a while).
3. **APIs & Services → Credentials → Create OAuth client ID** → type
   "Web application".
   - **Authorized redirect URIs**:
     `https://your-domain.de/api/auth/callback/google`
     (locally also `http://localhost:3000/api/auth/callback/google`).
4. Client ID + secret into the `.env`:

```bash
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
```

## Verifying

After setting the variables: start the app, open `/login` — the email form
appears (and, if configured, "Continue with Google"). Enter the email → the
link arrives → clicking it signs you in. Verification tokens live in the DB
table `verificationTokens` (Drizzle adapter).

## Creating the operator/admin account

**Locally you do not have to do anything.** The very first account in a fresh
app becomes `owner` by itself — sign in at `/login` with any address you like,
and the admin area plus the "Users" entry in the navigation are there right
away. The rule and its boundary live in `lib/users/bootstrap.ts`, wired into
`auth.ts` and `lib/auth/dev-login.ts` — the role is assigned while the account
comes into being, not afterwards, because the session is a JWT and carries the
role from the moment of sign-in.

**That bootstrap applies in DEV only, deliberately.** In STAGING and PROD the
first person to sign in is not necessarily you — a freshly deployed instance
has an empty user table too, and the first visitor may be a customer. Handing
them user management would be an account takeover. There you create your
account up front instead.

Accounts otherwise come into being on the first magic-link sign-in with role
`member` — a password never creates one, it can only be added to an account
that already exists. So that the **operator** can sign in as admin (`owner`),
create the account **up front** via CLI (the row is reused at sign-in):

```bash
node scripts/users/create-user.mjs --email owner@example.com --role owner --apply
# or: node run.mjs user-create --email owner@example.com --role owner --apply
```

Roles: `owner` = operator/admin, `member` = customer. Protect admin areas with
`requireOwner()` (`lib/authz.ts`). Details: `scripts/users/README.md`.

## Changing the email address

The core is in the intro above: a Member changes their own address by proving
they can read mail at the new one — a link sent there, and nothing moves until
it is clicked. The rest of the machinery lives in `lib/email-change/`, and
these are the details worth knowing before you touch it:

- **One pending change per Member.** A new request replaces the old one and
  kills its link — that is how a typo'd address is corrected, and why there is
  no cancel button to build. Until a link is followed, the old address still
  signs in, a password still works, and an abandoned request stays abandoned
  for ever.
- **Why the rate limits are three, not two.** The two mail counters (three an
  hour, per account *and* per target address) exist because this is the one
  action where a signed-in person chooses both that mail is sent and who it
  goes to — and it is the operator's sender reputation that pays for leaving it
  open. The third counter meters the *answer*: refusing an address as already
  taken tells the requester an account exists there, and a refusal sends
  nothing, so neither mail counter charges for it. Twenty an hour per account,
  counted on every request that reaches the lookup. Without it the refusal is
  an enumeration oracle a script can query for free — `security-gateway` found
  exactly that after the feature first shipped, which is why it is written
  down here.
- **Confirming sets `emailVerified`**, where the Operator's `setUserEmail()`
  clears it. Not an inconsistency to tidy away: there an address is asserted by
  somebody else and has proved nothing; here following the link IS the proof.
- **Confirming claims purchases** made under the new address, the same pass
  that runs at first sign-in. A failed claim never fails the change.
- **Nothing the Member owns moves with the address.** Attribution runs on
  `memberId`, not on an address, so balance, ledger, grants, role and running
  subscriptions are untouched by a change.
- **The session keeps the old address until the next sign-in.** It is a JWT and
  holds the state from sign-in time, so the sidebar shows the old address for a
  while. The account page reads `users.email` from the database for exactly
  this reason — being wrong there would be wrong on the page somebody opens to
  check.

The old address is told about the move, with no link — if the change was not
the owner's doing, that mail is the only way they find out.

## Passwords: the pieces

If you touch the password feature, these are the files:

| | |
|---|---|
| `lib/credentials/rules.ts` | pure rules — minimum length, no composition rules, and the sliding-window limit on failed attempts |
| `lib/credentials/hash.ts` | scrypt from `node:crypto`. The **only** file that writes or reads `users.passwordHash` |
| `lib/credentials/manage.ts` | the shell: set, remove, and the sign-in check. Acts only on the account whose id the caller read from the session |
| `lib/auth/password-login.ts` | the Auth.js Credentials provider, id `"password"` |
| `lib/email.ts` | `sendCredentialChangeEmail()` — the notice mail below |

The password sign-in refuses blocked accounts like every other provider, and it
is checked **twice** — in `verifyPasswordLogin()` and again in the `signIn`
callback in `auth.ts`. That redundancy is deliberate; do not tidy it away.
Rejected sign-ins of every kind land on `/login?error=AccessDenied` — the path
`pages.error` in `auth.config.ts` configures — where a blocked account reads
"Account blocked".

The Operator's menu entry **send sign-in link** is the recovery path seen from
the other side — it runs through `signIn()` from Auth.js, so the same token
mechanism applies as with a normal sign-in.

### The credential notice mail

Setting, changing or removing a password mails the account address. It is the
only defence against the case nothing else covers: somebody reaches an unlocked
machine, opens the account page and sets a password on themselves — a
credential that outlives the borrowed session, and without the notice the owner
never finds out. Three rules about that mail, all load-bearing:

- **It carries no link, and must not grow one.** Not a "wasn't me" button, not
  a revoke link, not a sign-in link. A security notice that acts on a click is
  a phishing template with your sender address on it; one that cannot act is
  useless to forge, which is what makes it safe to send to an account that may
  already be in the wrong hands. `lib/email.test.ts` asserts this.
- **A failed send never undoes the change.** The password is already written
  when the notice goes out, so `notify()` in `app/dashboard/account/actions.ts`
  swallows every error into a log line. Telling the Member it failed would be a
  lie that also loses their change; a machine with no mail transport configured
  is a normal state here, not an error.
- **The subject names which change it was.** It is what somebody reads in a
  list of unopened mail, and "a password was created" is alarming to a person
  who created none, where a generic "something changed" is not.

This is the second mail the app sends, and the opposite shape from the first:
`sendLoginEmail()` is nothing but a link, this one must contain none. That is
why `lib/email.ts` composes a `Mail` and hands it to one transport, rather than
every send function taking a `url`.

## "JWTSessionError: no matching decryption secret"

If this appears in the log (or in the Next.js dev overlay) on a page that only
reads the session, no one has attacked anything: the browser is holding a
session cookie from **another** installation. Cookies know nothing about ports,
so every app on `localhost` shares one cookie store — and a cookie encrypted
with a different `AUTH_SECRET` cannot be decrypted with this one.

Locally the app avoids this by itself: the session cookie carries a short
fingerprint of `AUTH_SECRET` in its name (`lib/auth/cookie-names.ts`), so two
installations never reach for the same cookie. In STAGING/PROD each app has its
own domain and the Auth.js defaults apply.

So if you do see the message, the app is running with `APP_ENV` other than
`development`, with a non-local `APP_URL`, or with no `AUTH_SECRET` — check
`.env`. Deleting the `authjs.*` cookies in the browser clears the leftover.

## "An unexpected response was received from the server."

The other side of the same coin, and it looks nothing like a cookie problem.
Signing in fails with that sentence, the Next.js overlay points at
`app/login/page.tsx` — and **that page is fine**. Two details give it away:

- the dev log shows the `GET /login` and then **no `POST`** at all
- it started right after you created another app from this template

The cookie names above stop installations from decrypting each other's sessions.
What they cannot do is remove the names an installation stops using: cookies
know nothing about ports, so every copy ever started on this machine keeps
sending its session to every other one, for as long as it has not expired. Once
they add up past Node's 16 KB header limit, the request is refused with `431` by
the HTTP parser **before Next.js sees it** — hence no log line — and the browser
turns that into the sentence above, blaming the page that was waiting for the
answer.

**Right now:** clear the cookies for `localhost` (DevTools → Application →
Cookies → `http://localhost:<port>`) and sign in again. `node run.mjs errors`
says the same thing if you would rather ask the app.

**From now on:** the DEV cookies expire after a week, and once there is more
than 6 KB of them the app deletes the ones belonging to other installations
(`lib/auth/cookie-names.ts`, carried out in `proxy.ts`). Below that threshold
nothing is touched, so two apps you are working on at the same time both stay
signed in. Above it you may find yourself signed out of the other one — that is
the trade, and it is the better half of it.

One limit is honest to name: a jar that filled up past ~16 KB while this app
was closed kills even the GET — the app never runs, nothing can prune, and only
the manual clearing above helps. The full reasoning — why every installation
has its own cookie names in the first place, and why the sweep has a threshold —
is in `CLAUDE.md` → **Several copies on one machine**.
